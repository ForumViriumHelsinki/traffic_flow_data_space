# Traffic Flow Data Space (TFDS)

General repository for the Traffic Flow Data Space (TFDS) project. This project is carried out in collaboration with the city of Helsinki, Forum Virium Helsinki, Porto Digital and Nationaal Dataportaal Wegverkeer (NDW).

The repository showcases the architectural designs, data production scripts, integration workflows, and visualization demonstrators developed for the TFDS initiative.

---

## Repository Structure

```
traffic_flow_data_space/
├── doc/                                    # Architecture design and infrastructure deployment docs
│   ├── SIMPL-k3s/                          # Guides for setting up single-node and multi-node k3s clusters
│   │   ├── k3s_setup_single_node.md
│   │   ├── k3s_setup_multi_node.md
│   │   └── README.md
│   ├── schematics/                         # MermaidJS logical architecture diagrams
│   │   ├── IDEA/                           # IDEA data space diagrams
│   │   ├── SIMPL-data_space_architecture/  # Onboarding, authorization, catalog publication, and discovery processes
│   │   └── README.md
│   └── README.md
├── src/                                    # Source code, utility tools, data producers, and integration flows
│   ├── git-scripts/                        # Helper scripts for repository cloning and updating
│   │   ├── git_puller.sh
│   │   ├── simpl_cloner.sh
│   │   └── README.md
│   ├── tfds-application-integration/       # JSON exports for Google Application Integration workflows
│   ├── tfds-dailyflow-producer/            # Google Apps Script evaluating flow impact levels
│   ├── tfds-datex2-producer/               # Google Apps Script converting traffic disturbances into Datex II format
│   ├── tfds-speedwarning-producer/         # Google Apps Script identifying traffic congestion warnings
│   ├── tfds-viewer/                        # Leaflet map demonstrator visualizing generated data products
│   └── README.md
├── LICENSE
└── README.md                               # This file
```

---

## Directory Navigation

*   **[doc/](doc)**: Documentation regarding architecture design and infrastructure deployment.
    *   **[doc/schematics/](doc/schematics)**: MermaidJS logical architecture diagrams outlining participant onboarding, authentication, publishing, querying, and data transaction processes. Read the [Schematics README](doc/schematics/README.md).
    *   **[doc/SIMPL-k3s/](doc/SIMPL-k3s)**: Guides for setting up single-node and multi-node k3s clusters for deploying SIMPL nodes. Read the [K3s Setup README](doc/SIMPL-k3s/README.md).
*   **[src/](src)**: Source code, utility tools, data producers, and integration flows. Read the [Source README](src/README.md).
    *   **[src/tfds-speedwarning-producer/](src/tfds-speedwarning-producer)**: Google Apps Script checking InfluxDB for real-time and typical speed ratios to publish traffic congestion midpoints as GeoJSON to Google Cloud Storage (GCS).
    *   **[src/tfds-datex2-producer/](src/tfds-datex2-producer)**: Google Apps Script mapping disturbance GCS data and active segment closures into Datex II formatted `SituationPublication` JSON documents.
    *   **[src/tfds-dailyflow-producer/](src/tfds-dailyflow-producer)**: Google Apps Script correlating active GCS disturbances with InfluxDB flow data (`running_mean`) over 24 hours to output GeoJSON points.
    *   **[src/tfds-application-integration/](src/tfds-application-integration)**: JSON definitions for Google Application Integration orchestration workflows:
        *   `Allu_Retriever`: Daily retrieval of city infrastructure and area rental WFS data to GCS.
        *   `HSY_Retriever`: Hourly retrieval of real-time air quality WFS data to GCS.
        *   `HSY_InfluxWriter`: Parses and ingests individual air quality WFS features into InfluxDB.
        *   `TFDS-AirQuality-Trigger`: Orchestrates air quality data processing by matching monitoring stations to road segments.
        *   `TFDS-AirQuality-Worker`: Queries InfluxDB historical data, calculates air quality metrics for mapped pairs, and writes outcomes to InfluxDB.
    *   **[src/tfds-viewer/](src/tfds-viewer)**: Interactive Leaflet map demonstrator visualizing generated data products.
    *   **[src/git-scripts/](src/git-scripts)**: Auxiliary scripts for managing code bases in local environments.

## Additional Repositories

The following repositories represent integral outcomes of the TFDS project, containing the key software deliverables, validation engines, dashboards, and custom data space connector components:

### Traffic Analysis & Dashboards (IDEA)

*   **[IDEA-Helsinki](https://github.com/ForumViriumHelsinki/IDEA-Helsinki)**: A traffic validation system that analyzes the impact of traffic disturbances on road segments using real-time floating car data.
*   **[TFDS_Dashboard](https://github.com/ForumViriumHelsinki/TFDS_Dashboard)**: A dashboard connected directly to InfluxDB for time-series data storage, analysis, and real-time visualization of floating car data and IDEA validated road segments. Along side the floating car data, the dashboard visualizes city air quality and a calculated air guality index (AQI), which indicates the changes altering traffic flow has on air quality.

### SIMPL-Open Data Space Components

These repositories contain deployment configurations, manifests, and Helm charts customized for TFDS agents and infrastructure, optimized for both scalable multi-node cloud environments and single-node local Kubernetes (k3s) environments:

*   **[TFDS_SIMPL-open_common_components](https://github.com/ForumViriumHelsinki/TFDS_SIMPL-open_common_components)**: Configurations and deployment manifests for SIMPL-Open Common Components.
*   **[TFDS_SIMPL-open_governance_authority](https://github.com/ForumViriumHelsinki/TFDS_SIMPL-open_governance_authority)**: Configurations and deployment manifests for the SIMPL-Open Governance Authority agent.
*   **[TFDS_SIMPL-open_data_consumer](https://github.com/ForumViriumHelsinki/TFDS_SIMPL-open_data_consumer)**: Configurations and deployment manifests for the SIMPL-Open Data Consumer agent.
*   **[TFDS_SIMPL-open_data_provider](https://github.com/ForumViriumHelsinki/TFDS_SIMPL-open_data_provider)**: Configurations and deployment manifests for the SIMPL-Open Data Provider agent.
*   **[TFDS-SIMPL-open-helm-charts](https://github.com/ForumViriumHelsinki/TFDS-SIMPL-open-helm-charts)**: Helm charts for Level 3 microservices and shared infrastructure used by TFDS agents, flattened to support a highly visible GitOps deployment model.
*   **[TFDS-SIMPL-open-applications](https://github.com/ForumViriumHelsinki/TFDS-SIMPL-open-applications)**: Monorepo hosting customized application source codes and critical hotfixes optimized for TFDS agent deployments.
