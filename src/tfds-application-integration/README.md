# Google Application Integration Processes

This repository contains JSON definitions for several Google Application Integration processes. These integrations handle data retrieval from various urban data sources, storage in Google Cloud Storage (GCS), and processing for InfluxDB.

## Integration Overviews

### 1. Allu_Retriever (v2)
- **File:** `Allu_Retriever-v2.json`
- **Description:** Retrieves city infrastructure data from Helsinki's WFS services.
- **Trigger:** Scheduled (CRON: `0 15 * * *` - Daily at 01:00 GMT+2).
- **Core Tasks:**
    - Fetches data from `Aluevuokraus_alue`, `Kaivuilmoitus_alue`, and `Lyhyt_maanvuokraus_alue` WFS endpoints.
    - Stores the retrieved data as JSON files in the `tfds-allu` GCS bucket.

### 2. HSY_Retriever (v5)
- **File:** `HSY_Retriever-v5.json`
- **Description:** Retrieves air quality data hourly, writes to bucket, and triggers InfluxDB writes.
- **Trigger:** Scheduled (CRON: `5 */1 * * *` - Hourly).
- **Core Tasks:**
    - Fetches real-time air quality data from HSY (Helsinki Region Environmental Services) WFS service.
    - Saves the raw data and current state to the `tfds-air-quality` GCS bucket.
    - Iterates through the retrieved features and triggers the `HSY_InfluxWriter` sub-integration for each.

### 3. HSY_InfluxWriter (v3)
- **File:** `HSY_InfluxWriter-v3.json`
- **Description:** Handles the ingestion of individual HSY air quality features into InfluxDB.
- **Trigger:** Private Trigger (called by `HSY_Retriever`).
- **Core Tasks:**
    - Parses HSY feature JSON data.
    - Formats data into InfluxDB Line Protocol.
    - Writes the data point to a configured InfluxDB instance.

### 4. TFDS-AirQuality-Trigger (v5)
- **File:** `TFDS-AirQuality-Trigger-v5.json`
- **Description:** Orchestrates the TFDS air quality data production by triggering worker integrations.
- **Trigger:** Scheduled (CRON: `*/5 * * * *` - Every 5 minutes).
- **Core Tasks:**
    - Downloads configuration (`station-segment-pairs.json`) from the `tfds-air-quality` GCS bucket.
    - Iterates through the configuration entries.
    - Triggers the `TFDS-AirQuality-Worker` for each configured station/segment pair.

### 5. TFDS-AirQuality-Worker (v15)
- **File:** `TFDS-AirQuality-Worker-v15.json`
- **Description:** Processes air quality data for specific stations and segments.
- **Trigger:** Private Trigger (called by `TFDS-AirQuality-Trigger`).
- **Core Tasks:**
    - Reads HSY data from the GCS bucket.
    - Queries InfluxDB for historical ("typical") air quality and traffic data.
    - Performs computations/extraction based on the station and segment mapping.
    - Writes processed results back to InfluxDB.

## Common Components
- **Connectors:** Most integrations use a GCS connector (`tfds-connector`) for reading and writing data to buckets.
- **Storage:** GCS buckets `tfds-allu` and `tfds-air-quality` are used for raw data and configuration.
- **Database:** InfluxDB is used as the primary time-series database for air quality and traffic metrics.
