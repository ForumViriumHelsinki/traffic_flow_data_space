# TFDS Architectural Schematics

This directory contains MermaidJS logical architecture diagrams detailing the design and data flow of the Traffic Flow Data Space (TFDS).

## Overview

The schematics are organized as follows:

*   **[IDEA Architecture](IDEA/IDEA_architecture.md)**: Diagrams outlining the interaction of data providers and consumers (such as ALLU, FCD data, HSY API, and the IDEA platform) using Data Space Connectors (DSCs).
*   **SIMPL Data Space Processes** (under [SIMPL-data_space_architecture](SIMPL-data_space_architecture)):
    *   **[Onboarding Process](SIMPL-data_space_architecture/Onboarding_Process.md)**: Visualizes the workflow for registering new participants.
    *   **[Participant Authorization Process](SIMPL-data_space_architecture/Participant_Authorization_Process.md)**: Depicts the authorization check and access token issuance flow.
    *   **[Publication and Discovery Process](SIMPL-data_space_architecture/Publication_and_Discovery_process.md)**: Outlines how data offerings are registered and queried in the catalog.
