package org.opencloudengine.argus.catalog.collector.impala;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Asynchronous HTTP sender for Impala query events.
 *
 * <p>Sends captured query events to the Argus Catalog Metadata Sync
 * collector endpoint via HTTP POST. Requests are sent asynchronously
 * on a dedicated thread pool so they never block Impala query processing.</p>
 *
 * <p>JSON payload format:</p>
 * <pre>
 * {
 *   "timestamp": 1742536200000,
 *   "query": "SELECT * FROM db.table",
 *   "plan": "01:SCAN HDFS ...",
 *   "user": "alice",
 *   "delegateUser": "bob",
 *   "platformId": "impala-19d0bfe954e3fd2cd"
 * }
 * </pre>
 */
public class QuerySender {

    private static final String LOG_PREFIX = "[ImpalaQueryAgent] ";

    private static String targetUrl;
    private static String platformId;
    private static HttpClient httpClient;
    private static ObjectMapper objectMapper;
    private static ExecutorService executor;

    /**
     * Initialize the sender. Called once from {@link ImpalaQueryAgent#premain}.
     */
    public static void initialize(String url, String platform) {
        targetUrl = url;
        platformId = platform;
        httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_2)
                .connectTimeout(Duration.ofSeconds(3))
                .build();
        objectMapper = new ObjectMapper();
        executor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "impala-query-sender");
            t.setDaemon(true);
            return t;
        });
    }

    /**
     * Send a query event asynchronously.
     *
     * @param timestamp      query start time (epoch millis)
     * @param query          SQL query text
     * @param plan           query execution plan (may be null)
     * @param connectedUser  authenticated connected user (session.connected_user)
     * @param delegateUser   delegated/proxy user (session.delegated_user, may be null)
     * @param effectiveUser  effective user (TSessionStateUtil.getEffectiveUser — delegateUser if set, else connectedUser)
     */
    public static void send(long timestamp, String query, String plan,
                            String connectedUser, String delegateUser, String effectiveUser) {
        if (targetUrl == null || executor == null) return;

        // Build payload on the calling thread (cheap)
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("timestamp", timestamp);
        payload.put("query", query);
        payload.put("plan", plan);
        payload.put("connectedUser", connectedUser);
        payload.put("delegateUser", delegateUser);
        payload.put("effectiveUser", effectiveUser);
        payload.put("platformId", platformId);

        // Send on background thread (never block Impala)
        executor.submit(() -> {
            try {
                String json = objectMapper.writeValueAsString(payload);
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(targetUrl))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(json))
                        .timeout(Duration.ofSeconds(5))
                        .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() != 200) {
                    System.err.println(LOG_PREFIX + "Collector responded with HTTP " + response.statusCode()
                            + ": " + response.body());
                }
            } catch (Exception e) {
                System.err.println(LOG_PREFIX + "Failed to send query event: " + e.getMessage());
            }
        });
    }
}
