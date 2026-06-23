#!/bin/zsh

# Configuration
ROOT_DIR="TFDS-SIMPL"
BASE_URL="https://code.europa.eu/simpl/simpl-open/development"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting Simpl-Open Repository Cloning to ${ROOT_DIR}...${NC}"

# Create Root Directory
if [ ! -d "$ROOT_DIR" ]; then
    mkdir "$ROOT_DIR"
    echo -e "${GREEN}Created directory: $ROOT_DIR${NC}"
else
    echo -e "${YELLOW}Directory $ROOT_DIR already exists. Updating existing or cloning new...${NC}"
fi

cd "$ROOT_DIR" || exit

# Function to clone git repo
# Usage: clone_repo "Category_Folder" "Repo_Name" "Full_URL"
clone_repo() {
    local folder=$1
    local name=$2
    local url=$3

    # Create category folder if not exists
    if [ ! -d "$folder" ]; then
        mkdir -p "$folder"
    fi

    if [ -d "$folder/$name" ]; then
        echo -e "${YELLOW}[SKIP] $folder/$name already exists.${NC}"
    else
        echo -e "${GREEN}[CLONE] Cloning $name into $folder...${NC}"
        git clone "$url" "$folder/$name" || { echo -e "${NC}[ERROR] Failed to clone $name"; exit 1; }
    fi
}

# ==========================================
# 1. INTERNAL SIMPL-OPEN REPOSITORIES
# ==========================================

# Group: Agents
clone_repo "Agents" "data-provider" "$BASE_URL/agents/data-provider.git"
clone_repo "Agents" "Common-Components" "$BASE_URL/agents/common_components.git"
clone_repo "Agents" "application-provider" "$BASE_URL/agents/application-provider.git"
clone_repo "Agents" "consumer" "$BASE_URL/agents/consumer.git"
clone_repo "Agents" "governance-authority" "$BASE_URL/agents/governance-authority.git"
clone_repo "Agents" "infrastructure-provider" "$BASE_URL/agents/infrastructure-provider.git"

# Group: Common Components
clone_repo "Common-Components" "kafka" "$BASE_URL/common-components/kafka.git"
clone_repo "Common-Components" "postgres-cluster" "$BASE_URL/common-components/postgres-cluster.git"
clone_repo "Common-Components" "shared-specs" "$BASE_URL/common-components/shared-specs.git"
clone_repo "Common-Components" "vault" "$BASE_URL/common-components/vault.git"
clone_repo "Common-Components" "openbao" "$BASE_URL/common-components/openbao.git"
clone_repo "Common-Components" "openbao-init" "$BASE_URL/common-components/openbao-init.git"

# Group: Contract & Billing ---- ----
clone_repo "Contract-Billing" "notification-service" "$BASE_URL/contract-billing/notification-service.git"
clone_repo "Contract-Billing" "stubs" "$BASE_URL/contract-billing/stubs.git"
clone_repo "Contract-Billing" "contract" "$BASE_URL/contract-billing/contract.git"
clone_repo "Contract-Billing" "actors" "$BASE_URL/contract-billing/actors.git"
clone_repo "Contract-Billing" "billing" "$BASE_URL/contract-billing/billing.git"
clone_repo "Contract-Billing" "billing_common" "$BASE_URL/contract-billing/billing_common.git"
clone_repo "Contract-Billing" "common" "$BASE_URL/contract-billing/common.git"
clone_repo "Contract-Billing" "common_logging" "$BASE_URL/contract-billing/common_logging.git"
clone_repo "Contract-Billing" "common_logging_python" "$BASE_URL/contract-billing/common_logging_python.git"
clone_repo "Contract-Billing" "invoicing" "$BASE_URL/contract-billing/invoicing.git"
clone_repo "Contract-Billing" "settlement" "$BASE_URL/contract-billing/settlement.git"
clone_repo "Contract-Billing" "simpl-issuance" "$BASE_URL/contract-billing/simpl-issuance.git"
clone_repo "Contract-Billing" "simpl-storage" "$BASE_URL/contract-billing/simpl-storage.git"
clone_repo "Contract-Billing" "consumer-contract-billing" "$BASE_URL/contract-billing/consumer-contract-billing.git"
clone_repo "Contract-Billing" "contract-ui" "$BASE_URL/contract-billing/contract-ui.git"
clone_repo "Contract-Billing" "provider-contract-billing" "$BASE_URL/contract-billing/provider-contract-billing.git"
clone_repo "Contract-Billing" "signing-service" "$BASE_URL/contract-billing/signing-service.git"
clone_repo "Contract-Billing" "vc-issuer-service" "$BASE_URL/contract-billing/vc-issuer-service.git"
clone_repo "Contract-Billing" "wallet-service" "$BASE_URL/contract-billing/wallet-service.git"

# Group: Data1 (Backend Services)
clone_repo "Data1" "charts" "$BASE_URL/data1/charts.git"
clone_repo "Data1" "common" "$BASE_URL/data1/common.git"
clone_repo "Data1" "common-adapter" "$BASE_URL/data1/common-adapter.git"
clone_repo "Data1" "common-tier2" "$BASE_URL/data1/common-tier2.git"
clone_repo "Data1" "contract-consumption-be" "$BASE_URL/data1/contract-consumption-be.git"
clone_repo "Data1" "edcconnectoradapter" "$BASE_URL/data1/edcconnectoradapter.git"
clone_repo "Data1" "schema-sync-adapter" "$BASE_URL/data1/schema-sync-adapter.git"
clone_repo "Data1" "sdtooling-api-be" "$BASE_URL/data1/sdtooling-api-be.git"
clone_repo "Data1" "sdtooling-sd-schemas" "$BASE_URL/data1/sdtooling-sd-schemas.git"
clone_repo "Data1" "sdtooling-validation-api-be" "$BASE_URL/data1/sdtooling-validation-api-be.git"
clone_repo "Data1" "simpl-files" "$BASE_URL/data1/simpl-files.git"
clone_repo "Data1" "simpl-mock-services" "$BASE_URL/data1/simpl-mock-services.git"
clone_repo "Data1" "simpl-vue-components" "$BASE_URL/data1/simpl-vue-components.git"
clone_repo "Data1" "xsfc-advsearch-be" "$BASE_URL/data1/xsfc-advsearch-be.git"
clone_repo "Data1" "consumer-data1" "$BASE_URL/data1/consumer-data1.git"
clone_repo "Data1" "provider-data1" "$BASE_URL/data1/provider-data1.git"
clone_repo "Data1" "sd-schemas-util" "$BASE_URL/data1/sd-schemas-util.git"

# Group: Data Services
clone_repo "Data-Services" "dataframe-level-anonymisation" "$BASE_URL/data-services/dataframe-level-anonymisation.git"
clone_repo "Data-Services" "field-level-pseudo-anonymisation" "$BASE_URL/data-services/field-level-pseudo-anonymisation.git"
clone_repo "Data-Services" "semaphoreui-deployer-service" "$BASE_URL/data-services/semaphoreui-deployer-service.git"
clone_repo "Data-Services" "util-services" "$BASE_URL/data-services/util-services.git"
clone_repo "Data-Services" "data-processing" "$BASE_URL/data-services/data-processing.git"
clone_repo "Data-Services" "template-code-location" "$BASE_URL/data-services/template-code-location.git"

# Group: Gaia-X & EDC
clone_repo "Gaia-X-EDC" "Connector" "$BASE_URL/gaia-x-edc/Connector.git"
clone_repo "Gaia-X-EDC" "edc-extensions" "$BASE_URL/gaia-x-edc/edc-extensions.git"
clone_repo "Gaia-X-EDC" "edc-minio-s3" "$BASE_URL/gaia-x-edc/edc-minio-s3.git"
clone_repo "Gaia-X-EDC" "simpl-catalogue-client" "$BASE_URL/gaia-x-edc/simpl-catalogue-client.git"
clone_repo "Gaia-X-EDC" "simpl-contract-negotiation-mockup" "$BASE_URL/gaia-x-edc/simpl-contract-negotiation-mockup.git"
clone_repo "Gaia-X-EDC" "simpl-edc" "$BASE_URL/gaia-x-edc/simpl-edc.git"
clone_repo "Gaia-X-EDC" "simpl-fc-service" "$BASE_URL/gaia-x-edc/simpl-fc-service.git"
clone_repo "Gaia-X-EDC" "simpl-files" "$BASE_URL/gaia-x-edc/simpl-files.git"
clone_repo "Gaia-X-EDC" "simpl-schema-manager" "$BASE_URL/gaia-x-edc/simpl-schema-manager.git"
clone_repo "Gaia-X-EDC" "simpl-schema-manager-ui" "$BASE_URL/gaia-x-edc/simpl-schema-manager-ui.git"
clone_repo "Gaia-X-EDC" "poc-gaia-edc" "$BASE_URL/gaia-x-edc/poc-gaia-edc.git"
clone_repo "Gaia-X-EDC" "simpl-sd-ui" "$BASE_URL/gaia-x-edc/simpl-sd-ui.git"
clone_repo "Gaia-X-EDC" "simpl-signer" "$BASE_URL/gaia-x-edc/simpl-signer.git"
clone_repo "Gaia-X-EDC" "authority-gaia-x-edc" "$BASE_URL/gaia-x-edc/authority-gaia-x-edc.git"
clone_repo "Gaia-X-EDC" "consumer-gaia-x-edc" "$BASE_URL/gaia-x-edc/consumer-gaia-x-edc.git"
clone_repo "Gaia-X-EDC" "edelivery" "$BASE_URL/gaia-x-edc/edelivery.git"
clone_repo "Gaia-X-EDC" "provider-gaia-x-edc" "$BASE_URL/gaia-x-edc/provider-gaia-x-edc.git"
clone_repo "Gaia-X-EDC" "simpl-schema-versioning" "$BASE_URL/gaia-x-edc/simpl-schema-versioning.git"

# Group: IAA (Identity & Access)
clone_repo "IAA" "authentication_provider" "$BASE_URL/iaa/authentication_provider.git"
clone_repo "IAA" "charts" "$BASE_URL/iaa/charts.git"
clone_repo "IAA" "cli" "$BASE_URL/iaa/cli.git"
clone_repo "IAA" "common" "$BASE_URL/iaa/common.git"
clone_repo "IAA" "documentation" "$BASE_URL/iaa/documentation.git"
clone_repo "IAA" "echo-backend" "$BASE_URL/iaa/echo-backend.git"
clone_repo "IAA" "echo-frontend" "$BASE_URL/iaa/echo-frontend.git"
clone_repo "IAA" "eidas-demo-keycloak-extension" "$BASE_URL/iaa/eidas-demo-keycloak-extension.git"
clone_repo "IAA" "eidas-demo-node-deploy" "$BASE_URL/iaa/eidas-demo-node-deploy.git"
clone_repo "IAA" "ejbca-preconfig" "$BASE_URL/iaa/ejbca-preconfig.git"
clone_repo "IAA" "fe-authentication-provider" "$BASE_URL/iaa/fe-authentication-provider.git"
clone_repo "IAA" "fe-identity-provider" "$BASE_URL/iaa/fe-identity-provider.git"
clone_repo "IAA" "fe-onboarding" "$BASE_URL/iaa/fe-onboarding.git"
clone_repo "IAA" "fe-security-attribute-provider" "$BASE_URL/iaa/fe-security-attribute-provider.git"
clone_repo "IAA" "fe-users-and-roles" "$BASE_URL/iaa/fe-users-and-roles.git"
clone_repo "IAA" "identity-provider" "$BASE_URL/iaa/identity-provider.git"
clone_repo "IAA" "keycloak-authenticator" "$BASE_URL/iaa/keycloak-authenticator.git"
clone_repo "IAA" "onboarding" "$BASE_URL/iaa/onboarding.git"
clone_repo "IAA" "security-attributes-provider" "$BASE_URL/iaa/security-attributes-provider.git"
clone_repo "IAA" "simpl-fe" "$BASE_URL/iaa/simpl-fe.git"
clone_repo "IAA" "tier1-gateway" "$BASE_URL/iaa/tier1-gateway.git"
clone_repo "IAA" "tier2-gateway" "$BASE_URL/iaa/tier2-gateway.git"
clone_repo "IAA" "users-roles" "$BASE_URL/iaa/users-roles.git"
clone_repo "IAA" "authority-iaa" "$BASE_URL/iaa/agent-iaa/authority-iaa.git"
clone_repo "IAA" "consumer-iaa" "$BASE_URL/iaa/agent-iaa/consumer-iaa.git"
clone_repo "IAA" "participant-iaa" "$BASE_URL/iaa/agent-iaa/participant-iaa.git"
clone_repo "IAA" "provider-iaa" "$BASE_URL/iaa/agent-iaa/provider-iaa.git"
clone_repo "IAA" "angular-remote" "$BASE_URL/iaa/microfrontend-framework/angular-remote.git"
clone_repo "IAA" "angular-shell" "$BASE_URL/iaa/microfrontend-framework/angular-shell.git"
clone_repo "IAA" "react-remote" "$BASE_URL/iaa/microfrontend-framework/react-remote.git"
clone_repo "IAA" "vue-remote" "$BASE_URL/iaa/microfrontend-framework/vue-remote.git"
clone_repo "IAA" "fe-openapi-clients" "$BASE_URL/iaa/fe-openapi-clients.git"
clone_repo "IAA" "simpl-http-client" "$BASE_URL/iaa/simpl-http-client.git"
clone_repo "IAA" "test-automation" "$BASE_URL/iaa/test-automation.git"
clone_repo "IAA" "test-automation-ui" "$BASE_URL/iaa/test-automation-ui.git"
clone_repo "IAA" "tier1-authentication" "$BASE_URL/iaa/tier1-authentication.git"
clone_repo "IAA" "tier2-proxy" "$BASE_URL/iaa/tier2-proxy.git"

# Group: Infrastructure
clone_repo "Infrastructure" "infrastructure-be" "$BASE_URL/infrastructure/infrastructure-be.git"
clone_repo "Infrastructure" "infrastructure-crossplane" "$BASE_URL/infrastructure/infrastructure-crossplane.git"
clone_repo "Infrastructure" "infrastructure-crossplane-dependences" "$BASE_URL/infrastructure/infrastructure-crossplane-dependences.git"
clone_repo "Infrastructure" "infrastructure-edc" "$BASE_URL/infrastructure/infrastructure-edc.git"
clone_repo "Infrastructure" "infrastructure-fe" "$BASE_URL/infrastructure/infrastructure-fe.git"
clone_repo "Infrastructure" "infrastructure-provisioner" "$BASE_URL/infrastructure/infrastructure-provisioner.git"
clone_repo "Infrastructure" "infrastructure-application-deployer" "$BASE_URL/infrastructure/infrastructure-application-deployer.git"
clone_repo "Infrastructure" "provider-infrastructure" "$BASE_URL/infrastructure/provider-infrastructure.git"

# Group: Monitoring
clone_repo "Monitoring" "eck-monitoring" "$BASE_URL/monitoring/eck-monitoring.git"
clone_repo "Monitoring" "infrastructure-consumption-monitoring-service" "$BASE_URL/monitoring/infrastructure-consumption-monitoring-service.git"
clone_repo "Monitoring" "authority-monitoring" "$BASE_URL/monitoring/authority-monitoring.git"
clone_repo "Monitoring" "consumer-monitoring" "$BASE_URL/monitoring/consumer-monitoring.git"
clone_repo "Monitoring" "eck-monitoring-operator" "$BASE_URL/monitoring/eck-monitoring-operator.git"
clone_repo "Monitoring" "monitoring-proxy" "$BASE_URL/monitoring/monitoring-proxy.git"
clone_repo "Monitoring" "monitoring-reporting-fe" "$BASE_URL/monitoring/monitoring-reporting-fe.git"
clone_repo "Monitoring" "provider-monitoring" "$BASE_URL/monitoring/provider-monitoring.git"

# Group: orchestration-platform
clone_repo "orchestration-platform" "asset-orchestrator" "$BASE_URL/orchestration-platform/asset-orchestrator.git"
clone_repo "orchestration-platform" "dagster" "$BASE_URL/orchestration-platform/dagster.git"
clone_repo "orchestration-platform" "dagster-dev-local" "$BASE_URL/orchestration-platform/dagster-dev-local.git"
clone_repo "orchestration-platform" "data-analytic-visualisation" "$BASE_URL/orchestration-platform/data-analytic-visualisation.git"
clone_repo "orchestration-platform" "gateway-oauth2-client" "$BASE_URL/orchestration-platform/gateway-oauth2-client.git"
clone_repo "orchestration-platform" "gitea" "$BASE_URL/orchestration-platform/gitea.git"
clone_repo "orchestration-platform" "provider-orchestration-platform" "$BASE_URL/orchestration-platform/provider-orchestration-platform.git"

# Gitlab profile (Stored in root or a config folder)
clone_repo "General" "gitlab-profile" "$BASE_URL/gitlab-profile.git"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}      Cloning Process Complete          ${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "All repositories are located in: $(pwd)"
