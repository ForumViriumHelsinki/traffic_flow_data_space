# Kubernetes Setup for SIMPL data space components

This guide details the setup of a Kubernetes cluster using k3s for a single node (one computer) on an Ubuntu/Debian environment.
**Note** this assumes that the user is **not Root** and has sudo rights.

## Requirements for SIMPL

| Tool                   | Version | Notes             |
|:-----------------------|:--------|:------------------|
| **Kubernetes**         | 1.29.x  | Using k3s, 1.33+  |
| **Git**                | 2.47.x+ |                   |
| **Helm**               | 4.x+    |                   |
| **LoadBalancer**       | N/A     | Using MetalLB     |
| **nginx-ingress**      | 1.10.x+ |                   |
| **cert-manager**       | 1.15.x+ |                   |
| **Argo CD**            | 2.11.x+ |                   |
| **nfs-provisioner**    | 4.0.x+  | Using kvaps chart |
| **kube-state-metrics** | 2.13.x+ |                   |

## Prerequisites (Server Setup)

Before installing k3s, we need to install helm (to manage applications) and git (for Argo CD).

### Install git
```shell
Update apt and install git  
sudo apt-get update  
sudo apt-get install git -y
```

### Install Helm
```shell
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-4
chmod 700 get_helm.sh
./get_helm.sh
```

## **Step 1: Install k3s**

First, we install k3s itself. We use a version that corresponds to Kubernetes 1.29 and disable the built-in servicelb and traefik to use our own NGINX and MetalLB.

### Increase OS-Level Limits (Optional: Only if enabling Crossplane Infrastructure Provisioning)
If you intend to enable the **Infrastructure Provisioning Module** (`crossplane: enabled: true`) to allow the Data Agent to auto-provision external cloud environments (like OVH or IONOS), you must increase the host OS limits.

The heavy GitOps controllers (Argo Events, FluxCD, Crossplane) require a significant number of file watchers. Before installing k3s, increase the `inotify` limits to prevent these specific pods from crashing with `too many open files` errors.

*(Note: If you are deploying a standard Data Provider on a local vanilla k3s cluster without external cloud provisioning, you can skip this step).*

```shell
echo "fs.inotify.max_user_instances=8192" | sudo tee -a /etc/sysctl.conf
echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf
echo "fs.file-max=2097152" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Set the desired k3s version (based on k8s 1.3+)
```shell
export K3S_VERSION="v1.33.5+k3s1"
```
### Run the k3s installer
```shell
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=${K3S_VERSION} sh -s - server --disable=servicelb --disable=traefik --write-kubeconfig-mode=644
```

## Configure kubectl Access

Configure the shell to find and use the new cluster's configuration file.

### Set the KUBECONFIG variable in current session
```shell
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
```

### Add KUBECONFIG to .bashrc to make it permanent
```shell
echo "export KUBECONFIG=/etc/rancher/k3s/k3s.yaml" >> ~/.bashrc 
 source ~/.bashrc
```

### Verify the cluster is running
```shell
kubectl get nodes
```

**Expected Output:**
```shell
NAME        STATUS   ROLES                  AGE   VERSION  
k8s-xyz     Ready    control-plane,master   60s   v1.33.5+k3s1
```

## Install and configure MetalLB (loadbalancer)

The MetalLB will assign the servers single public IP to services that request it.

### Install MetalLB
```shell
helm repo add metallb https://metallb.github.io/metallb
helm repo update
helm install metallb metallb/metallb --namespace metallb-system --create-namespace --wait
```

### Configure MetalLB:
Create a file named *metallb-config.yaml* . **IMPORTANT:** Replace the <PUBLIC-IP> with the servers actual public IP address. **Note** That this example assumes that only a WAN IP is used, therefore the subnet is /32 (255.255.255.255)(Only one address available)

```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: default-pool
  namespace: metallb-system
spec:
  addresses:
  - <PUBLIC-IP>/32
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: default-adv
  namespace: metallb-system
spec:
  ipAddressPools:
  - default-pool
```
**Apply the configuration:**
```shell
kubectl apply -f metallb-config.yaml
```

## Set Up NFS for ReadWriteMany (RWX) Volumes

### Install and Configure the NFS Server

Update apt and install required base packages
```shell
sudo apt-get update  
sudo apt-get install git nfs-common -y
```

### Deploy the NFS Provisioner via Helm

1. Add the official Helm repository
```shell
helm repo add kvaps https://kvaps.github.io/charts
helm repo update
```

2. Install the provisioner.
```shell
helm install nfs-server kvaps/nfs-server-provisioner \
  --namespace nfs-provisioner \
  --create-namespace \
  --set persistence.enabled=true \
  --set persistence.size=100Gi \
  --set persistence.storageClass=local-path
```
This will create a StorageClass named nfs that your applications can use for RWM volumes.

### Ensure local-path Remains the Default StorageClass (recommended)

```shell
kubectl patch storageclass local-path -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
kubectl patch storageclass nfs -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
```

#### Testing the setup

Create a file called *test-nfs.yaml*

```yaml
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-rwx-pvc
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: nfs
  resources:
    requests:
      storage: 100Mi
---
apiVersion: v1
kind: Pod
metadata:
  name: test-nfs-pod
spec:
  containers:
    - name: test-container
      image: busybox
      command: [ "sh", "-c", "echo 'Storage is active!' > /data/success.txt && sleep 3600" ]
      volumeMounts:
        - name: nfs-volume
          mountPath: /data
  volumes:
    - name: nfs-volume
      persistentVolumeClaim:
        claimName: test-rwx-pvc
```

Apply and check

```shell
kubectl apply -f test-nfs.yaml

# Check if the PVC successfully grabbed a volume (Status should be 'Bound')
kubectl get pvc test-rwx-pvc

# Wait a moment, then check if the pod is running
kubectl get pod test-nfs-pod

kubectl exec test-nfs-pod -- cat /data/success.txt
```

If everything is working perfectly, this will output: Storage is active!
Once verified, clean up the test.

```shell
kubectl delete -f test-nfs.yaml
```

## Install NGINX Ingress Controller

This will automatically ask MetalLB for the hosts public IP and bind it to ports 80/443.

**Important:** The `--set controller.extraArgs.enable-ssl-passthrough=""` flag is strictly required for SIMPL. It allows the Ingress Controller to pass raw TLS connections directly to the Tier 2 Gateway for mTLS Participant Credential verification.

```shell
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.extraArgs.enable-ssl-passthrough="true" \
  --wait
```

Wait for a moment and check that metalLB has provisioned the ingress controller (not the *ingress-nginx-controller-admission*) with an IP address.

```shell
kubectl get svc -n ingress-nginx
```

### Update an Existing NGINX Installation (Optional)

If you have already installed the NGINX Ingress Controller without the required `ssl-passthrough` flag, you do not need to reinstall it. You can apply a live patch to the deployment instead:

```shell
kubectl patch deployment -n ingress-nginx ingress-nginx-controller --type='json' -p='[
  {"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--enable-ssl-passthrough"}
]'
```

Wait for the controller to finish rolling out the new configuration:

```shell
kubectl rollout status deployment/ingress-nginx-controller -n ingress-nginx
```

## Install Cert-Manager

This is required for automatic SSL certificates.

```shell
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager --namespace cert-manager --create-namespace --set crds.enabled=true --wait
```

### Configure certificate issuer

This is named after the the one used in the SIMPL installation (default name they use)

Create *dev-prod-issuer.yaml* configuration file.

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: dev-prod
spec:
  acme:
    email: "tatu.erkinjuntti@forumvirium.fi"

    server: https://acme-v02.api.letsencrypt.org/directory

    privateKeySecretRef:
      name: dev-prod-account-key

    solvers:
    - http01:
        ingress:
          class: nginx
```

Apply configuration

```shell
kubectl apply -f dev-prod-issuer.yaml
```

Check that configuration is ready

```shell
kubectl describe clusterissuer dev-prod
```

### Configure a self-signed certificate issuer
**NOTE:** This is related to the elka-CA, which issues certificates for internal services.
This is noted in the deployment manifests.

Create *self-signed-issuer.yaml* configuration file.

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:                                                                                                                        
  name: self-signed-issuer                                                                                                       
spec:                                                                                                                            
  selfSigned: {} 
```

Apply configuration

```shell
kubectl apply -f self-signed-issuer.yaml
```

## Install ArgoCD

This is a GitOps tool.

```shell
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
helm install argocd argo/argo-cd --namespace argocd --create-namespace --wait
```

### Get the initial ArgoCD password
The password is auto-generated and stored in a secret.

```shell
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d && echo
```
**Save this password!**

### Define ArgoCD UI access (domain URL needed!)

Create a file named *argocd-ingress.yaml*, this will enable the nginx ingress to manage access

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-server-ingress
  namespace: argocd
  annotations:
    cert-manager.io/cluster-issuer: "dev-prod"

    nginx.ingress.kubernetes.io/backend-protocol: "HTTPS"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  rules:
    - host: argocd.ds.helsinki.tfds.io
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argocd-server
                port:
                  name: https

  tls:
    - hosts:
        - argocd.ds.helsinki.tfds.io
      secretName: argocd-server-tls
```
Apply the configuration
```shell
kubectl apply -f argocd-ingress.yaml
```
## Install kube-state-metrics

This service provides cluster-level metrics for monitoring.

```shell
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

kubectl create namespace devsecopstools

helm install kube-prometheus-stack-kube-state-metrics prometheus-community/kube-state-metrics --namespace devsecopstools --set fullnameOverride=kube-prometheus-stack-kube-state-metrics
```

## Check that all services are installed

```shell
kubectl get svc -A
```

**Expected output**

```shell
NAMESPACE        NAME                                       TYPE           CLUSTER-IP      EXTERNAL-IP    PORT(S)                      AGE
argocd           argocd-applicationset-controller           ClusterIP      10.43.135.102   <none>         7000/TCP                     6m8s
argocd           argocd-dex-server                          ClusterIP      10.43.62.219    <none>         5556/TCP,5557/TCP            6m8s
argocd           argocd-redis                               ClusterIP      10.43.155.37    <none>         6379/TCP                     6m8s
argocd           argocd-repo-server                         ClusterIP      10.43.24.48     <none>         8081/TCP                     6m8s
argocd           argocd-server                              ClusterIP      10.43.7.235     <none>         80/TCP,443/TCP               6m8s
cert-manager     cert-manager                               ClusterIP      10.43.12.162    <none>         9402/TCP                     66m
cert-manager     cert-manager-cainjector                    ClusterIP      10.43.247.133   <none>         9402/TCP                     66m
cert-manager     cert-manager-webhook                       ClusterIP      10.43.115.13    <none>         443/TCP,9402/TCP             66m
default          kubernetes                                 ClusterIP      10.43.0.1       <none>         443/TCP                      74m
devsecopstools   kube-prometheus-stack-kube-state-metrics   ClusterIP      10.43.58.254    <none>         8080/TCP                     17s
ingress-nginx    ingress-nginx-controller                   LoadBalancer   10.43.129.74    46.62.142.55   80:30550/TCP,443:31462/TCP   67m
ingress-nginx    ingress-nginx-controller-admission         ClusterIP      10.43.23.12     <none>         443/TCP                      67m
kube-system      kube-dns                                   ClusterIP      10.43.0.10      <none>         53/UDP,53/TCP,9153/TCP       74m
kube-system      metrics-server                             ClusterIP      10.43.135.63    <none>         443/TCP                      74m
metallb-system   metallb-webhook-service                    ClusterIP      10.43.11.63     <none>         443/TCP                      72m
nfs-provisioner   nfs-server-nfs-server-provisioner          ClusterIP      10.43.123.233   <none>         2049/TCP,2049/UDP,32803/TCP,32803/UDP,20048/TCP,20048/UDP,875/TCP,875/UDP,111/TCP,111/UDP,662/TCP,662/UDP   17h
```

# Optional: Deploy MinIO (For Provider and Consumer agents)

MinIO provides S3-compatible object storage.  
This deployment ensures MinIO is accessible internally for agents and externally via secure URLs,  
utilizing the NFS storage class we configured earlier.

Because we are using a GitOps architecture, we will deploy MinIO directly through ArgoCD rather than using manual Helm commands.

**Note:** In the earlier examples the domain has been **ds.helsinki.tfds.io**, but since it is intended to be a Governance Authority,  
in this example the idea.helsinki.tfds.io domain will be used (provider agent)

### Create a namespace and create secrets

**Note:** Replace the *rootUser* and *rootPassword*

```shell
kubectl create namespace minio

kubectl create secret generic minio-admin-credentials \
  --namespace minio \
  --from-literal=rootUser=admin \
  --from-literal=rootPassword=<YOUR_SECURE_PASSWORD>
```

### Create the ArgoCD Application Manifest

### Create the Configuration File

Because MinIO requires separate access for its API (S3 traffic) and its Console (Web UI), we need to define two separate subdomains and bypass NGINX's default upload limits.

Create a file named *minio-argocd-app.yaml*  
(Note: Replace s3.idea.helsinki.tfds.io and minio.idea.helsinki.tfds.io with your actual domain names, and change the default password and username!)

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: minio
  namespace: argocd
spec:
  project: default
  source:
    repoURL: 'https://charts.min.io/'
    chart: minio
    targetRevision: "5.*" # The current stable major version of the official chart
    helm:
      valuesObject:
        # Reference to the Kubernetes Secret created previously
        existingSecret: "minio-admin-credentials"

        # Set to standalone since we are using an NFS backend
        mode: standalone
        replicas: 1

        persistence:
          enabled: true
          storageClass: "nfs"
          size: 50Gi

        # Informs MinIO of external URLs for presigned links and redirects
        environment:
          MINIO_SERVER_URL: "https://s3.idea.helsinki.tfds.io"
          MINIO_BROWSER_REDIRECT_URL: "https://minio.idea.helsinki.tfds.io"

        # Configuration for the S3 API (Used by Agents)
        ingress:
          enabled: true
          ingressClassName: "nginx"
          annotations:
            cert-manager.io/cluster-issuer: "dev-prod"
            nginx.ingress.kubernetes.io/ssl-redirect: "true"
            nginx.ingress.kubernetes.io/proxy-body-size: "0" # Disables upload limits for agents
          hosts:
            - "s3.idea.helsinki.tfds.io"
          tls:
            - hosts:
                - "s3.idea.helsinki.tfds.io"
              secretName: minio-api-tls

        # Configuration for the Web UI Console
        consoleIngress:
          enabled: true
          ingressClassName: "nginx"
          annotations:
            cert-manager.io/cluster-issuer: "dev-prod"
            nginx.ingress.kubernetes.io/ssl-redirect: "true"
            nginx.ingress.kubernetes.io/proxy-body-size: "0" # Disables upload limits for the Web UI
          hosts:
            - "minio.idea.helsinki.tfds.io"
          tls:
            - hosts:
                - "minio.idea.helsinki.tfds.io"
              secretName: minio-console-tls

  destination:
    server: 'https://kubernetes.default.svc'
    namespace: minio
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

### Deploy via ArgoCD

Apply the manifest to tell ArgoCD to fetch, build, and deploy the application:

```shell
kubectl apply -f minio-argocd-app.yaml
```
You can now log into your ArgoCD Web UI, and you will see the minio application spinning up, provisioning its NFS storage, and requesting its SSL certificates automatically.

### How to Access MinIO

Once ArgoCD shows the application as fully Synced and Healthy, your Agents can interact with it using these endpoints:

- Internal Cluster Access (Fastest, bypasses external network):
  - Endpoint: http://minio.minio.svc.cluster.local:9000
- External API Access (For external consumer/provider agents):
  - Endpoint: https://s3.idea.helsinki.tfds.io
- Web Console (For Human Administration):
  - URL: https://minio.idea.helsinki.tfds.io
