# TFDS Source Code and Utilities

This directory contains the primary software components, integration workflows, and helper utilities developed for the Traffic Flow Data Space (TFDS).

## Components

### 1. Data Product Producers (Google Apps Scripts)
*   **[tfds-speedwarning-producer/](file:///Users/tatu.erkinjuntti/Development/Repositories/SIMPL-DEV/TFDS-SIMPL/TFDS-SIMPL-OPEN_DEVELOPMENT/traffic_flow_data_space/src/tfds-speedwarning-producer)**: Identifies potential traffic congestion. Queries InfluxDB for real-time and typical speed data, filters segments where current speed falls below typical levels (speed ratio < 0.25), merges segment geometries, and publishes midpoint coordinates to GCS as GeoJSON.
*   **[tfds-datex2-producer/](file:///Users/tatu.erkinjuntti/Development/Repositories/SIMPL-DEV/TFDS-SIMPL/TFDS-SIMPL-OPEN_DEVELOPMENT/traffic_flow_data_space/src/tfds-datex2-producer)**: Converts traffic disturbances into the Datex II standard format. Fetches logs from GCS, correlates them with segment closures checked via InfluxDB, and outputs a `SituationPublication` JSON payload back to GCS.
*   **[tfds-dailyflow-producer/](file:///Users/tatu.erkinjuntti/Development/Repositories/SIMPL-DEV/TFDS-SIMPL/TFDS-SIMPL-OPEN_DEVELOPMENT/traffic_flow_data_space/src/tfds-dailyflow-producer)**: Assesses flow impact levels around disturbances. Aggregates InfluxDB historical running means, computes geographical center points for active incidents, and outputs GeoJSON points to GCS.

### 2. Integration & Visualisation
*   **[tfds-application-integration/](file:///Users/tatu.erkinjuntti/Development/Repositories/SIMPL-DEV/TFDS-SIMPL/TFDS-SIMPL-OPEN_DEVELOPMENT/traffic_flow_data_space/src/tfds-application-integration)**: Orchestration logic exported as Google Application Integration processes for querying urban feeds and feeding data points into InfluxDB.
*   **[tfds-viewer/](file:///Users/tatu.erkinjuntti/Development/Repositories/SIMPL-DEV/TFDS-SIMPL/TFDS-SIMPL-OPEN_DEVELOPMENT/traffic_flow_data_space/src/tfds-viewer)**: Interactive, browser-based mapping utility (using Leaflet.js) to display and preview TFDS data products.

### 3. Utility Scripts
*   **[git-scripts/](file:///Users/tatu.erkinjuntti/Development/Repositories/SIMPL-DEV/TFDS-SIMPL/TFDS-SIMPL-OPEN_DEVELOPMENT/traffic_flow_data_space/src/git-scripts)**: Auxiliary helper scripts used to clone and manage codebase checkouts within local development structures.
