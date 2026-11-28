package io.voidrunner.game;

import java.io.Closeable;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

final class WirePeer {
    static final int MAX_FRAME = 1024 * 1024;
    private static final int MAX_QUEUE = 2 * MAX_FRAME;
    private static final int MAX_PACKETS = 64;

    interface Listener {
        void message(String payload, Runnable consumed);
        void closed(String reason);
    }

    private final Socket socket;
    private final Listener listener;
    private final ArrayDeque<byte[]> queue = new ArrayDeque<>();
    private byte[] pendingSnapshot;
    private int queuedBytes;
    private boolean closed;
    private Thread reader;

    WirePeer(Socket socket, Listener listener) {
        this.socket = socket;
        this.listener = listener;
    }

    void start() {
        reader = new Thread(this::read, "Voidrunner receive");
        reader.start();
        new Thread(this::write, "Voidrunner send").start();
    }

    void send(String payload, boolean latest) {
        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
        if (bytes.length == 0 || bytes.length > MAX_FRAME) {
            close("Invalid message size.");
            return;
        }
        synchronized (this) {
            if (closed) return;
            if (pendingSnapshot != null && (latest || queue.size() >= MAX_PACKETS || queuedBytes + bytes.length > MAX_QUEUE)) {
                queue.remove(pendingSnapshot);
                queuedBytes -= pendingSnapshot.length;
                pendingSnapshot = null;
            }
            if (queue.size() < MAX_PACKETS && queuedBytes + bytes.length <= MAX_QUEUE) {
                queue.addLast(bytes);
                queuedBytes += bytes.length;
                if (latest) pendingSnapshot = bytes;
                notifyAll();
                return;
            }
        }
        if (!latest) close("The connection could not keep up.");
    }

    private void read() {
        try {
            DataInputStream in = new DataInputStream(socket.getInputStream());
            while (true) {
                int length = in.readInt();
                if (length <= 0 || length > MAX_FRAME) throw new IOException("Invalid frame");
                byte[] bytes = new byte[length];
                in.readFully(bytes);
                String payload = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString();
                CountDownLatch received = new CountDownLatch(1);
                listener.message(payload, received::countDown);
                // Bound the inbound WebView queue even when a phone is suspended.
                if (!received.await(30, TimeUnit.SECONDS)) break;
            }
        } catch (IOException | InterruptedException ignored) {
        } finally { close("Peer left the room."); }
    }

    private void write() {
        try {
            DataOutputStream out = new DataOutputStream(socket.getOutputStream());
            while (true) {
                byte[] bytes;
                synchronized (this) {
                    while (!closed && queue.isEmpty()) wait();
                    if (closed) return;
                    bytes = queue.removeFirst();
                    queuedBytes -= bytes.length;
                    if (bytes == pendingSnapshot) pendingSnapshot = null;
                }
                out.writeInt(bytes.length);
                out.write(bytes);
            }
        } catch (IOException | InterruptedException ignored) {
        } finally { close("Peer left the room."); }
    }

    void close(String reason) {
        synchronized (this) {
            if (closed) return;
            closed = true;
            queue.clear();
            pendingSnapshot = null;
            notifyAll();
        }
        quietlyClose(socket);
        if (reader != null) reader.interrupt();
        listener.closed(reason);
    }

    static void quietlyClose(Closeable resource) {
        if (resource != null) try { resource.close(); } catch (IOException ignored) {}
    }
}
