package io.voidrunner.game;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;

final class LanSession {
    private static final String TYPE = "_voidrunner._tcp";
    private static final Runnable DELIVERED = () -> {};
    interface Events { void emit(JSONObject event, Runnable done); }
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Events events;
    private final NsdManager nsd;
    private final ConnectivityManager connectivity;
    private final WifiManager wifi;
    private final Map<String, NsdServiceInfo> rooms = new LinkedHashMap<>();
    private final Map<String, WirePeer> peers = new ConcurrentHashMap<>();
    private volatile String session = "";
    private Network network;
    private WifiManager.MulticastLock multicast;
    private NsdManager.DiscoveryListener discovery;
    private NsdManager.RegistrationListener registration;
    private ServerSocket server;
    private boolean visible;
    private boolean foreground = true;
    private boolean resumeBrowsing;
    private String roomName;
    private int joinAttempt;

    LanSession(Context context, Events events) {
        this.events = events;
        nsd = context.getSystemService(NsdManager.class);
        connectivity = context.getSystemService(ConnectivityManager.class);
        wifi = context.getApplicationContext().getSystemService(WifiManager.class);
    }

    // Control and DNS callbacks are serialized on the main thread. The JS bridge
    // hands outgoing frames straight to the bounded per-peer writer queue.
    void send(JSONObject command) {
        if (!session.equals(command.optString("session"))) return;
        WirePeer peer = peers.get(command.optString("peerId"));
        if (peer != null) peer.send(command.optString("payload"), command.optBoolean("latest"));
    }

    void command(JSONObject command) {
        String token = command.optString("session");
        if (token.isEmpty() || token.length() > 100) return;
        String type = command.optString("type");
        if ((type.equals("browse") || type.equals("host")) && !token.equals(session)) {
            stop();
            session = token;
        }
        if (!token.equals(session)) return;
        try {
            switch (type) {
                case "browse":
                    if (!foreground) resumeBrowsing = true;
                    else if (discovery == null) { chooseNetwork(); browse(); }
                    else publishRooms();
                    break;
                case "host":
                    if (server == null) { chooseNetwork(); host(command.optString("name", "Voidrunner")); }
                    break;
                case "join": join(command.optString("roomId")); break;
                case "visibility":
                    visible = command.optBoolean("visible");
                    advertise();
                    break;
                case "disconnect":
                    WirePeer peer = peers.get(command.optString("peerId"));
                    if (peer != null) peer.close("Peer left the room.");
                    break;
                case "close": stop(); break;
            }
        } catch (SecurityException denied) { error(token, true); }
        catch (RuntimeException failed) { error(token, false); }
    }

    void permissionDenied(JSONObject command) { error(command.optString("session"), true); }

    private void chooseNetwork() {
        if (nsd == null || connectivity == null) throw new IllegalStateException("Network discovery unavailable");
        Network chosen = null;
        for (Network candidate : connectivity.getAllNetworks()) {
            NetworkCapabilities caps = connectivity.getNetworkCapabilities(candidate);
            if (caps != null && (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))) {
                chosen = candidate;
                if (candidate.equals(connectivity.getActiveNetwork())) break;
            }
        }
        if (chosen == null) throw new IllegalStateException("Connect to Wi-Fi.");
        network = chosen;
    }

    private void holdMulticast() {
        if (wifi != null && multicast == null) {
            multicast = wifi.createMulticastLock("Voidrunner discovery");
            multicast.setReferenceCounted(false);
            multicast.acquire();
        }
    }

    private void browse() {
        holdMulticast();
        String token = session;
        discovery = new NsdManager.DiscoveryListener() {
            public void onDiscoveryStarted(String ignored) {}
            public void onDiscoveryStopped(String ignored) {}
            public void onStartDiscoveryFailed(String ignored, int code) {
                ui.post(() -> { if (discovery == this) { endBrowse(); error(token, code == NsdManager.FAILURE_PERMISSION_DENIED); } });
            }
            public void onStopDiscoveryFailed(String ignored, int code) {}
            public void onServiceFound(NsdServiceInfo service) {
                ui.post(() -> {
                    if (discovery != this || service.getServiceName() == null || rooms.size() >= 64) return;
                    rooms.put(service.getServiceName(), service);
                    publishRooms();
                });
            }
            public void onServiceLost(NsdServiceInfo service) {
                ui.post(() -> {
                    if (discovery == this && rooms.remove(service.getServiceName()) != null) publishRooms();
                });
            }
        };
        try {
            if (Build.VERSION.SDK_INT >= 33)
                nsd.discoverServices(TYPE, NsdManager.PROTOCOL_DNS_SD, network, ui::post, discovery);
            else nsd.discoverServices(TYPE, NsdManager.PROTOCOL_DNS_SD, discovery);
            publishRooms();
        } catch (RuntimeException failure) { endBrowse(); throw failure; }
    }

    private void publishRooms() {
        JSONArray list = new JSONArray();
        for (String name : rooms.keySet()) list.put(json("id", name, "name", name));
        emit(session, "rooms", "rooms", list);
    }

    private void endBrowse() {
        NsdManager.DiscoveryListener old = discovery;
        discovery = null;
        rooms.clear();
        if (old != null) try { nsd.stopServiceDiscovery(old); } catch (RuntimeException ignored) {}
        releaseUnusedMulticast();
    }

    private void join(String room) {
        NsdServiceInfo found = rooms.get(room);
        String token = session;
        if (found == null) { error(token, false); return; }
        final int attempt = ++joinAttempt;
        ui.postDelayed(() -> {
            if (session.equals(token) && attempt == joinAttempt) {
                joinAttempt++;
                error(token, false);
            }
        }, 12_000);
        nsd.resolveService(found, new NsdManager.ResolveListener() {
            public void onResolveFailed(NsdServiceInfo info, int code) {
                ui.post(() -> joinFailed(token, attempt, code == NsdManager.FAILURE_PERMISSION_DENIED));
            }
            public void onServiceResolved(NsdServiceInfo info) {
                ui.post(() -> {
                    if (!session.equals(token) || attempt != joinAttempt) return;
                    List<InetAddress> hosts = Build.VERSION.SDK_INT >= 34 ? info.getHostAddresses() :
                        Collections.singletonList(info.getHost());
                    Network route = network;
                    new Thread(() -> connect(token, attempt, route, hosts, info.getPort()), "Voidrunner join").start();
                });
            }
        });
    }

    private void connect(String token, int attempt, Network route, List<InetAddress> hosts, int port) {
        for (InetAddress host : hosts) {
            if (host == null) continue;
            Socket socket = null;
            try {
                socket = route.getSocketFactory().createSocket();
                socket.connect(new InetSocketAddress(host, port), 3000);
                socket.setTcpNoDelay(true);
                Socket connected = socket;
                ui.post(() -> {
                    if (!session.equals(token) || attempt != joinAttempt) { WirePeer.quietlyClose(connected); return; }
                    joinAttempt++;
                    endBrowse();
                    attach(token, "host", connected);
                });
                return;
            } catch (IOException | RuntimeException failed) { WirePeer.quietlyClose(socket); }
        }
        ui.post(() -> joinFailed(token, attempt, false));
    }

    private void joinFailed(String token, int attempt, boolean permission) {
        if (session.equals(token) && attempt == joinAttempt) { joinAttempt++; error(token, permission); }
    }

    private void host(String name) {
        String token = session;
        roomName = name.isEmpty() ? "Voidrunner" : name;
        visible = true;
        Network route = network;
        new Thread(() -> {
            try {
                ServerSocket listener = new ServerSocket(0, 4);
                ui.post(() -> {
                    if (!session.equals(token) || server != null) { WirePeer.quietlyClose(listener); return; }
                    server = listener;
                    advertise();
                });
                while (!listener.isClosed()) {
                    Socket socket = listener.accept();
                    CountDownLatch accepted = new CountDownLatch(1);
                    try {
                        socket.setTcpNoDelay(true);
                        LinkProperties properties = connectivity.getLinkProperties(route);
                        boolean local = properties != null && properties.getLinkAddresses().stream()
                            .map(LinkAddress::getAddress).anyMatch(socket.getLocalAddress()::equals);
                        if (!local) { WirePeer.quietlyClose(socket); continue; }
                        ui.post(() -> {
                            try {
                                if (server != listener || !visible || !foreground || peers.size() >= 3) WirePeer.quietlyClose(socket);
                                else attach(token, UUID.randomUUID().toString(), socket);
                            } finally { accepted.countDown(); }
                        });
                        accepted.await();
                    } catch (IOException | InterruptedException | RuntimeException failed) { WirePeer.quietlyClose(socket); }
                }
            } catch (IOException | RuntimeException failed) {
                ui.post(() -> { if (session.equals(token)) error(token, failed instanceof SecurityException); });
            }
        }, "Voidrunner host").start();
    }

    private void advertise() {
        if (server == null) return;
        if (!visible || !foreground) { unpublish(); return; }
        if (registration != null) return;
        String token = session;
        NsdServiceInfo info = new NsdServiceInfo();
        info.setServiceName(roomName);
        info.setServiceType(TYPE);
        info.setPort(server.getLocalPort());
        if (Build.VERSION.SDK_INT >= 33) info.setNetwork(network);
        registration = new NsdManager.RegistrationListener() {
            public void onServiceRegistered(NsdServiceInfo service) {
                ui.post(() -> { if (registration == this) emit(token, "hosting"); });
            }
            public void onRegistrationFailed(NsdServiceInfo service, int code) {
                ui.post(() -> {
                    if (registration != this) return;
                    registration = null;
                    releaseUnusedMulticast();
                    error(token, code == NsdManager.FAILURE_PERMISSION_DENIED);
                });
            }
            public void onServiceUnregistered(NsdServiceInfo service) {}
            public void onUnregistrationFailed(NsdServiceInfo service, int code) {}
        };
        try {
            holdMulticast();
            nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, registration);
        }
        catch (RuntimeException failed) {
            registration = null;
            releaseUnusedMulticast();
            error(token, failed instanceof SecurityException);
        }
    }

    private void unpublish() {
        NsdManager.RegistrationListener old = registration;
        registration = null;
        if (old != null) try { nsd.unregisterService(old); } catch (RuntimeException ignored) {}
        releaseUnusedMulticast();
    }

    private void attach(String token, String id, Socket socket) {
        WirePeer peer = new WirePeer(socket, new WirePeer.Listener() {
            public void message(String payload, Runnable done) {
                events.emit(json("session", token, "type", "message", "peerId", id, "payload", payload), done);
            }
            public void closed(String reason) {
                ui.post(() -> {
                    if (session.equals(token) && peers.remove(id) != null)
                        emit(token, "close", "peerId", id, "reason", reason);
                });
            }
        });
        peers.put(id, peer);
        emit(token, "open", "peerId", id);
        peer.start();
    }

    private void error(String token, boolean permission) {
        emit(token, "error", "code", permission ? "permission" : "connection",
             "message", permission ? "Allow local network access in Settings." : "Check the Wi-Fi connection and try again.");
    }

    private void emit(String token, String type, Object... fields) {
        JSONObject message = json(fields);
        try { message.put("session", token).put("type", type); }
        catch (JSONException impossible) { throw new IllegalArgumentException(impossible); }
        events.emit(message, DELIVERED);
    }

    private static JSONObject json(Object... fields) {
        JSONObject object = new JSONObject();
        try {
            for (int i = 0; i < fields.length; i += 2) object.put((String) fields[i], fields[i+1]);
        } catch (JSONException impossible) { throw new IllegalArgumentException(impossible); }
        return object;
    }

    private void releaseUnusedMulticast() {
        if (discovery != null || registration != null || multicast == null) return;
        if (multicast.isHeld()) multicast.release();
        multicast = null;
    }

    void foreground(boolean active) {
        foreground = active;
        if (!active && discovery != null) {
            resumeBrowsing = true;
            endBrowse();
        } else if (active && resumeBrowsing) {
            resumeBrowsing = false;
            try { chooseNetwork(); browse(); }
            catch (RuntimeException failed) { error(session, failed instanceof SecurityException); }
        }
        advertise();
    }

    void stop() {
        session = "";
        resumeBrowsing = false;
        joinAttempt++;
        endBrowse();
        unpublish();
        WirePeer.quietlyClose(server);
        server = null;
        for (WirePeer peer : peers.values()) peer.close("Lobby closed.");
        peers.clear();
        releaseUnusedMulticast();
        network = null;
    }
}
