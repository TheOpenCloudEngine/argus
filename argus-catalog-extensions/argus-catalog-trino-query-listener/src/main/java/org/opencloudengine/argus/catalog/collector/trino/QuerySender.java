package org.opencloudengine.argus.catalog.collector.trino;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Asynchronous HTTP sender for Trino query events.
 *
 * <p>Sends query events to the Argus Catalog Metadata Sync collector endpoint
 * via HTTP POST on a background thread. The platformId is appended to each
 * payload automatically.</p>
 */
public class QuerySender {

    private static final String LOG_PREFIX = "[ArgusQueryAudit] ";

    private final String targetUrl;
    private final String platformId;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final ExecutorService executor;

    public QuerySender(String targetUrl, String platformId) {
        this.targetUrl = targetUrl;
        this.platformId = platformId;
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_2)
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        this.objectMapper = new ObjectMapper();
        this.executor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "argus-trino-query-sender");
            t.setDaemon(true);
            return t;
        });

        System.out.println(LOG_PREFIX + "QuerySender initialized.");
        System.out.println(LOG_PREFIX + "  Target URL  : " + targetUrl);
        System.out.println(LOG_PREFIX + "  Platform ID : " + platformId);
    }

    /**
     * Send a query event payload asynchronously.
     */
    public void send(Map<String, Object> payload) {
        payload.put("platformId", platformId);

        executor.submit(() -> {
            try {
                String json = objectMapper.writeValueAsString(payload);
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(targetUrl))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(json))
                        .timeout(Duration.ofSeconds(10))
                        .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() != 200) {
                    System.err.println(LOG_PREFIX + "Collector responded with HTTP "
                            + response.statusCode() + ": " + response.body());
                }
            } catch (Exception e) {
                System.err.println(LOG_PREFIX + "Failed to send query event: " + e.getMessage());
            }
        });
    }

    /**
     * Graceful shutdown — drain pending events.
     */
    public void shutdown() {
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
