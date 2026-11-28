package io.voidrunner.game;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class WirePeerTest {
    public static void main(String[] args) throws Exception {
        String hello = "{\"v\":1,\"name\":\"月🚀\"}";
        CountDownLatch gotHello = new CountDownLatch(1);
        CountDownLatch closed = new CountDownLatch(1);
        try (ServerSocket server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
             Socket client = new Socket(server.getInetAddress(), server.getLocalPort());
             Socket accepted = server.accept()) {
            client.setSoTimeout(3000);
            WirePeer peer = new WirePeer(accepted, new WirePeer.Listener() {
                public void message(String payload, Runnable consumed) {
                    if (payload.equals(hello)) gotHello.countDown();
                    consumed.run();
                }
                public void closed(String reason) { closed.countDown(); }
            });
            peer.send("{\"old\":true}", true);
            peer.send(hello, false);
            peer.send("{\"new\":true}", true);
            peer.start();
            DataInputStream input = new DataInputStream(client.getInputStream());
            for (String expected : new String[]{hello, "{\"new\":true}"}) {
                byte[] encoded = expected.getBytes(StandardCharsets.UTF_8);
                if (input.readInt() != encoded.length) throw new AssertionError("Frame byte length");
                byte[] bytes = new byte[encoded.length];
                input.readFully(bytes);
                if (!new String(bytes, StandardCharsets.UTF_8).equals(expected)) throw new AssertionError("Frame order");
            }
            DataOutputStream out = new DataOutputStream(client.getOutputStream());
            byte[] helloBytes = hello.getBytes(StandardCharsets.UTF_8);
            out.writeInt(helloBytes.length);
            for (byte b : helloBytes) out.write(b);
            if (!gotHello.await(3, TimeUnit.SECONDS)) throw new AssertionError("Split UTF-8 frame");
            out.writeInt(WirePeer.MAX_FRAME + 1);
            if (!closed.await(3, TimeUnit.SECONDS)) throw new AssertionError("Frame cap");
        }
        System.out.println("PASS TCP framing, UTF-8, latest/reliable ordering and frame cap.");
    }
}
