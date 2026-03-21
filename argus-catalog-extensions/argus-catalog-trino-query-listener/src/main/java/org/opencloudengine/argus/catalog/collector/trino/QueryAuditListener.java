package org.opencloudengine.argus.catalog.collector.trino;

import io.trino.spi.eventlistener.EventListener;
import io.trino.spi.eventlistener.QueryCompletedEvent;
import io.trino.spi.eventlistener.QueryContext;
import io.trino.spi.eventlistener.QueryIOMetadata;
import io.trino.spi.eventlistener.QueryInputMetadata;
import io.trino.spi.eventlistener.QueryMetadata;
import io.trino.spi.eventlistener.QueryOutputMetadata;
import io.trino.spi.eventlistener.QueryStatistics;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Trino EventListener that captures completed query events and sends them
 * to the Argus Catalog Metadata Sync collector endpoint.
 *
 * <p>Trino natively resolves input/output tables from the query plan, so
 * SQL parsing is not needed for lineage. The listener extracts:</p>
 * <ul>
 *   <li>Query text, query ID, query state</li>
 *   <li>User, principal, source (client tool)</li>
 *   <li>Input tables (catalog.schema.table) with columns read</li>
 *   <li>Output table (catalog.schema.table) with columns written</li>
 *   <li>Query plan (text)</li>
 *   <li>Timing, resource usage</li>
 *   <li>Error info on failure</li>
 * </ul>
 */
public class QueryAuditListener implements EventListener {

    private static final String LOG_PREFIX = "[ArgusQueryAudit] ";

    private final QuerySender sender;

    public QueryAuditListener(QuerySender sender) {
        this.sender = sender;
        System.out.println(LOG_PREFIX + "EventListener initialized.");
    }

    @Override
    public void queryCompleted(QueryCompletedEvent event) {
        try {
            Map<String, Object> payload = buildPayload(event);
            sender.send(payload);
        } catch (Exception e) {
            System.err.println(LOG_PREFIX + "Error processing query event: " + e.getMessage());
        }
    }

    private Map<String, Object> buildPayload(QueryCompletedEvent event) {
        QueryMetadata metadata = event.getMetadata();
        QueryContext context = event.getContext();
        QueryIOMetadata io = event.getIoMetadata();
        QueryStatistics stats = event.getStatistics();

        Map<String, Object> payload = new LinkedHashMap<>();

        // Query identification
        payload.put("queryId", metadata.getQueryId());
        payload.put("query", metadata.getQuery());
        payload.put("queryState", metadata.getQueryState());
        payload.put("queryType", context.getQueryType().map(Enum::name).orElse(null));

        // User information
        payload.put("user", context.getUser());
        payload.put("principal", context.getPrincipal().orElse(null));
        payload.put("source", context.getSource().orElse(null));
        payload.put("catalog", context.getCatalog().orElse(null));
        payload.put("schema", context.getSchema().orElse(null));
        payload.put("remoteClientAddress", context.getRemoteClientAddress().orElse(null));

        // Timing
        payload.put("createTime", event.getCreateTime().toEpochMilli());
        payload.put("executionStartTime", event.getExecutionStartTime().toEpochMilli());
        payload.put("endTime", event.getEndTime().toEpochMilli());
        payload.put("wallTimeMs", stats.getWallTime().toMillis());
        payload.put("cpuTimeMs", stats.getCpuTime().toMillis());
        payload.put("queuedTimeMs", stats.getQueuedTime().toMillis());

        // Plan
        payload.put("plan", metadata.getPlan().orElse(null));

        // Input tables (lineage source)
        List<Map<String, Object>> inputs = new ArrayList<>();
        for (QueryInputMetadata input : io.getInputs()) {
            Map<String, Object> inputMap = new LinkedHashMap<>();
            inputMap.put("catalog", input.getCatalogName());
            inputMap.put("schema", input.getSchema());
            inputMap.put("table", input.getTable());
            inputMap.put("columns", input.getColumns().stream()
                    .map(c -> c.getName())
                    .toList());
            input.getPhysicalInputBytes().ifPresent(v -> inputMap.put("physicalInputBytes", v));
            input.getPhysicalInputRows().ifPresent(v -> inputMap.put("physicalInputRows", v));
            inputs.add(inputMap);
        }
        payload.put("inputs", inputs);

        // Output table (lineage target)
        Optional<QueryOutputMetadata> outputOpt = io.getOutput();
        if (outputOpt.isPresent()) {
            QueryOutputMetadata output = outputOpt.get();
            Map<String, Object> outputMap = new LinkedHashMap<>();
            outputMap.put("catalog", output.getCatalogName());
            outputMap.put("schema", output.getSchema());
            outputMap.put("table", output.getTable());
            output.getColumns().ifPresent(cols -> {
                outputMap.put("columns", cols.stream()
                        .map(c -> c.getColumn())
                        .toList());
            });
            payload.put("output", outputMap);
        } else {
            payload.put("output", null);
        }

        // Resource usage
        payload.put("physicalInputBytes", stats.getPhysicalInputBytes());
        payload.put("physicalInputRows", stats.getPhysicalInputRows());
        payload.put("outputBytes", stats.getOutputBytes());
        payload.put("outputRows", stats.getOutputRows());
        payload.put("peakMemoryBytes", stats.getPeakUserMemoryBytes());

        // Error info
        event.getFailureInfo().ifPresent(failure -> {
            Map<String, Object> errorMap = new LinkedHashMap<>();
            errorMap.put("errorCode", failure.getErrorCode().getName());
            errorMap.put("failureType", failure.getFailureType().orElse(null));
            errorMap.put("failureMessage", failure.getFailureMessage().orElse(null));
            payload.put("failureInfo", errorMap);
        });

        return payload;
    }

    @Override
    public void shutdown() {
        sender.shutdown();
        System.out.println(LOG_PREFIX + "EventListener shut down.");
    }
}
