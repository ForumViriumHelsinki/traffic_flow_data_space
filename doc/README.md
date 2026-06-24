# TFDS Documentation

This directory contains architectural designs, schematics, and infrastructure deployment documentation for the Traffic Flow Data Space (TFDS).

## Contents

*   **[SIMPL-k3s/](SIMPL-k3s)**: Step-by-step guides for installing and configuring lightweight Kubernetes (`k3s`) environments required to host SIMPL nodes.
    *   Read the [K3s Setup README](SIMPL-k3s/README.md) for more details.
*   **[simpl-eval-cloud/](simpl-eval-cloud)**: The cloud (GKE) counterpart to the k3s guide — documentation of a managed-Kubernetes SIMPL-Open deployment on Google Cloud (`europe-north1`): GCP architecture, portability audit, SBOM, upstream feedback, and a deployment retrospective.
    *   Read the [SIMPL-eval Cloud README](simpl-eval-cloud/README.md) for the curated set and reading paths.
*   **[schematics/](schematics)**: MermaidJS logical architecture schematics detailing interactions between data space providers, consumers, and data space connectors (DSCs).
    *   Read the [Schematics README](schematics/README.md) for a directory of available diagrams (including onboarding, authentication, and data transaction processes).
