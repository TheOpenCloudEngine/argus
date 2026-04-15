package org.opencloudengine.argus.catalog.collector.starrocks;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.starrocks.plugin.AuditEvent;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Asynchronous HTTP sender for StarRocks audit events.
 *
 * <p>Events are buffered in an internal queue and sent in batches on a
 * background thread. This ensures {@link QueryAuditPlugin#exec(AuditEvent)}
 * returns immediately without blocking StarRocks query processing.</p>
 *
 * <p>JSON payload format:</p>
 * <pre>
 * {
 *   "queryId": "abc-123",
 *   "query": "SELECT * FROM db.table",
 *   "user": "alice",
 *   "authorizedUser": "alice@REALM",
 *   "database": "analytics",
 *   "catalog": "default_catalog",
 *   "state": "EOF",
 *   "queryTimeMs": 1500,
 *   "scanRows": 10000,
 *   "scanBytes": 1048576,
 *   "returnRows": 100,
 *   "cpuCostNs": 500000000,
 *   "memCostBytes": 268435456,
 *   "timestamp": 1742536200000,
 *   "digest": "a1b2c3d4",
 *   "platformId": "starrocks-019538a3e7c84f2b1"
 * }
 * </pre>
 */
public class QuerySender {

    private static final String LOG_PREFIX = "[ArgusAuditPlugin] ";
    private static final int QUEUE_CAPACITY = 10000;

    private final String targetUrl;
    private final String platformId;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final ExecutorService executor;
    private final LinkedBlockingQueue<Map<String, Object>> queue;
    private volatile boolean running = true;

    public QuerySender(String targetUrl, String platformId) {
        this.targetUrl = targetUrl;
        this.platformId = platformId;
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_2)
                .connectTimeout(Duration.ofSeconds(3))
                .build();
        this.objectMapper = new ObjectMapper();
        this.queue = new LinkedBlockingQueue<>(QUEUE_CAPACITY);

        // Background sender thread
        this.executor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "argus-starrocks-audit-sender");
            t.setDaemon(true);
            return t;
        });
        this.executor.submit(this::senderLoop);
    }

    /**
     * Enqueue an audit event for async sending. Non-blocking.
     */
    public void send(AuditEvent event) {
        Map<String, Object> payload = buildPayload(event);
        if (!queue.offer(payload)) {
            // Queue full — drop event to avoid backpressure on StarRocks
            System.err.println(LOG_PREFIX + "Queue full, dropping event: " + event.queryId);
        }
    }

    /**
     * Background loop that drains the queue and sends events.
     */
    private void senderLoop() {
        while (running || !queue.isEmpty()) {
            try {
                Map<String, Object> payload = queue.poll(1, TimeUnit.SECONDS);
                if (payload == null) continue;

                String json = objectMapper.writeValueAsString(payload);
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(targetUrl))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(json))
                        .timeout(Duration.ofSeconds(5))
                        .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() != 200) {
                    System.err.println(LOG_PREFIX + "Collector responded HTTP "
                            + response.statusCode() + ": " + response.body());
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                System.err.println(LOG_PREFIX + "Failed to send event: " + e.getMessage());
            }
        }
    }

    private Map<String, Object> buildPayload(AuditEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("queryId", event.queryId);
        payload.put("query", event.stmt);
        payload.put("user", event.user);
        payload.put("authorizedUser", event.authorizedUser);
        payload.put("clientIp", event.clientIp);
        payload.put("database", event.db);
        payload.put("catalog", event.catalog);
        payload.put("state", event.state);
        payload.put("errorCode", event.errorCode);
        payload.put("queryTimeMs", event.queryTime);
        payload.put("scanRows", event.scanRows);
        payload.put("scanBytes", event.scanBytes);
        payload.put("returnRows", event.returnRows);
        payload.put("cpuCostNs", event.cpuCostNs);
        payload.put("memCostBytes", event.memCostBytes);
        payload.put("timestamp", event.timestamp);
        payload.put("digest", event.digest);
        payload.put("isQuery", event.isQuery);
        payload.put("feIp", event.feIp);
        payload.put("stmtId", event.stmtId);
        payload.put("pendingTimeMs", event.pendingTimeMs);
        payload.put("platformId", platformId);
        return payload;
    }

    public void shutdown() {
        running = false;
        executor.shutdown();
        try {
            if (!executor.awaitTermination(10, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}
