# TFDS Source Code and Utilities

This directory contains software components, integration workflows, and helper utilities developed for the Traffic Flow Data Space (TFDS) project.

## Components

### 1. Data Product Producers (Google Apps Scripts)
*   **[tfds-speedwarning-producer/](tfds-speedwarning-producer)**: Identifies potential traffic congestion. Queries InfluxDB for real-time and typical speed data, filters segments where current speed falls below typical levels (speed ratio < 0.25), merges segment geometries, and publishes midpoint coordinates to Google Cloud Storage (GCS) as GeoJSON.
*   **[tfds-datex2-producer/](tfds-datex2-producer)**: Converts traffic disturbances into the Datex II standard format. Fetches logs from GCS, correlates them with segment closures checked via InfluxDB, and outputs a `SituationPublication` JSON payload back to GCS.
*   **[tfds-dailyflow-producer/](tfds-dailyflow-producer)**: Assesses flow impact levels around disturbances. Aggregates InfluxDB historical running means, computes geographical center points for active incidents, and outputs GeoJSON points to GCS.

### 2. Integration & Visualisation
*   **[tfds-application-integration/](tfds-application-integration)**: JSON definitions for Google Application Integration orchestration workflows:
    *   `Allu_Retriever`: Daily retrieval of city infrastructure and area rental WFS data to GCS.
    *   `HSY_Retriever`: Hourly retrieval of real-time air quality WFS data to GCS.
    *   `HSY_InfluxWriter`: Parses and ingests individual air quality WFS features into InfluxDB.
    *   `TFDS-AirQuality-Trigger`: Orchestrates air quality data processing by matching monitoring stations to road segments.
    *   `TFDS-AirQuality-Worker`: Queries InfluxDB historical data, calculates air quality metrics for mapped pairs, and writes outcomes to InfluxDB.
*   **[tfds-viewer/](tfds-viewer)**: Interactive, browser-based mapping utility (using Leaflet.js) to display and preview TFDS data products.

### 3. Utility Scripts
*   **[git-scripts/](git-scripts)**: Auxiliary helper scripts used to clone and manage codebase checkouts within local development structures.
*   **[simpl-chart-tools/](simpl-chart-tools)**: Deployment-agnostic helper for discovering, fetching, and diffing SIMPL-Open Helm charts from the European Commission's public registry on code.europa.eu — useful for version discovery and upgrade planning on either the k3s or managed-cloud deployment path.
