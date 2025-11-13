# Kubernetes Setup for SIMPL data space components

This guide details the setup of a Kubernetes cluster using k3s for a single node (one computer) on an Ubuntu/Debian environment.
**Note** this assumes that the user is **not Root** and has sudo rights.

## Requirements for SIMPL

| Tool                   | Version | Notes         |
|:-----------------------|:--------|:--------------|
| **Kubernetes**         | 1.29.x  | Using k3s     |
| **Git**                | 2.47.x+ |               |
| **Helm**               | 3.14.x+ |               |
| **LoadBalancer**       | N/A     | Using MetalLB |
| **nginx-ingress**      | 1.10.x+ |               |
| **cert-manager**       | 1.15.x+ |               |
| **Argo CD**            | 2.11.x+ |               |
| **nfs-provisioner**    | 4.0.x+  |               |
| **kube-state-metrics** | 2.13.x+ |               |

## Prerequisites (Server Setup)

Before installing k3s, we need to install helm (to manage applications) and git (for Argo CD).

### Install git
```
Update apt and install git  
sudo apt-get update  
sudo apt-get install git \-y
```

### Install Helm
```
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh
```

## **Step 1: Install k3s**

First, we install k3s itself. We use a version that corresponds to Kubernetes 1.29 and disable the built-in servicelb and traefik to use our own NGINX and MetalLB.

### Set the desired k3s version (based on k8s 1.29+)
```
export K3S_VERSION="v1.30.14+k3s2"
```
### Run the k3s installer
```
 curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=${K3S_VERSION} sh -s - server --disable=servicelb --disable=traefik --write-kubeconfig-mode=644
```

## Configure kubectl Access

Configure the shell to find and use the new cluster's configuration file.

### Set the KUBECONFIG variable in current session
```
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
```

### Add KUBECONFIG to .bashrc to make it permanent
```
echo "export KUBECONFIG=/etc/rancher/k3s/k3s.yaml" >> ~/.bashrc 
 source ~/.bashrc
```

### Verify the cluster is running
```
kubectl get nodes
```

**Expected Output:**
```
NAME        STATUS   ROLES                  AGE   VERSION  
k8s-xyz     Ready    control-plane,master   60s   v1.29.5+k3s1
```

## Install and configure MetalLB (loadbalancer)

The MetalLB will assign the servers single public IP to services that request it.

### Install MetalLB
```
helm repo add metallb https://metallb.github.io/metallb
helm repo update
helm install metallb metallb/metallb --namespace metallb-system --create-namespace --wait
```

### Configure MetalLB:  
Create a file named *metallb-config.yaml* . **IMPORTANT:** Replace the <PUBLIC-IP>/<PUBLIC-SUBNET> with the servers actual public IP address.

```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: default-pool
  namespace: metallb-system
spec:
  addresses:
  - <PUBLIC-IP>/<PUBLIC-SUBNET>
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
```
kubectl apply -f metallb-config.yaml
```

## Set Up NFS for ReadWriteMany (RWM) Volumes

Your nfs-provisioner requirement needs an active NFS server. Set one up on the host machine itself.

### On Ubuntu/Debian host

#### Install the NFS server
```
sudo apt-get update  
sudo apt-get install nfs-kernel-server \-y
```

#### Create the directory to share  
```
sudo mkdir -p /mnt/nfs_share
sudo chown nobody:nogroup /mnt/nfs_share 
sudo chmod 777 /mnt/nfs_share
```

#### Configure and apply export (only allows the server itself to connect)
```
echo "/mnt/nfs_share 127.0.0.1(rw,sync,no_subtree_check,no_root_squash)" | sudo tee /etc/exports
sudo exportfs -a
sudo systemctl restart nfs-kernel-server
```

### Install Kubernetes NFS Provisioner

Install the nfs-subdir-external-provisioner and point it to the host server configured.

```
helm repo add nfs-subdir-external-provisioner https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner
helm repo update
helm install nfs-provisioner nfs-subdir-external-provisioner/nfs-subdir-external-provisioner --namespace nfs-provisioner --create-namespace --set nfs.server=127.0.0.1 --set nfs.path=/mnt/nfs_share
```

This will create a StorageClass named nfs-client that your applications can use for RWM volumes.

## Install NGINX Ingress Controller

This will automatically ask MetalLB for the hosts public IP and bind it to ports 80/443.

```
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx --namespace ingress-nginx --create-namespace --wait
```

### Configure Nginx ingress controller to use control plane IP for load balancing.

```
kubectl edit svc ingress-nginx-controller -n ingress-nginx
```

Check that type is *LoadBalancer* and assign an IP (control plane) for the load balancer.

Example:

```yaml
type: LoadBalancer 
loadBalancerIP: 192.168.220.175
```
Wait for a moment and check that metalLB has provisioned the ingress controller with an IP address.

```
kubectl get svc -n ingress-nginx
```

## Install Cert-Manager

This is required for automatic SSL certificates.

```
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager --namespace cert-manager --create-namespace --set crds.enabled=true --wait
```

### Configure certificate issuer

#### Create staging

Create a *luster-issuer-prod.yaml* configuration file.

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    email: "tatu.erkinjuntti@forumvirium.fi"
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-staging-account-key

    solvers:
    - http01:
        ingress:
          # This matches the Ingress controller you have installed
          class: nginx
```

Apply configuration
```
kubectl apply -f cluster-issuer-staging.yaml
```
Check that configuration is ready

```
kubectl describe clusterissuer letsencrypt-staging
```

Expected output. Look for a condition with *Type: Ready* and *Status: True*.
```
Name:         letsencrypt-staging
Namespace:    
Labels:       <none>
Annotations:  <none>
API Version:  cert-manager.io/v1
Kind:         ClusterIssuer
Metadata:
  Creation Timestamp:  2025-11-13T13:22:01Z
  Generation:          1
  Resource Version:    2005
  UID:                 864bb43a-fe5f-438c-b9cd-b5fadd1f78bc
Spec:
  Acme:
    Email:  tatu.erkinjuntti@forumvirium.fi
    Private Key Secret Ref:
      Name:  letsencrypt-staging-account-key
    Server:  https://acme-staging-v02.api.letsencrypt.org/directory
    Solvers:
      http01:
        Ingress:
          Class:  nginx
Status:
  Acme:
    Last Private Key Hash:  vmKZIfudQn9HZh0SMQSTjsunutJCYV9FiGNo9e8tZCk=
    Last Registered Email:  tatu.erkinjuntti@forumvirium.fi
  Conditions:
    Last Transition Time:  2025-11-13T13:22:02Z
    Message:               The ACME account was registered with the ACME server
    Observed Generation:   1
    Reason:                ACMEAccountRegistered
    Status:                True
    Type:                  Ready
Events:                    <none>
```

#### Create prod

Create *cluster-issuer-prod.yaml* configuration file.

```
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    email: "tatu.erkinjuntti@forumvirium.fi"

    server: https://acme-v02.api.letsencrypt.org/directory

    privateKeySecretRef:
      name: letsencrypt-prod-account-key

    solvers:
    - http01:
        ingress:
          class: nginx
```

Apply configuration

```
kubectl apply -f cluster-issuer-prod.yaml
```

## Install ArgoCD

This is a GitOps tool.

```
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
helm install argocd argo/argo-cd --namespace argocd --create-namespace --wait
```

### Get the initial ArgoCD password
The password is auto-generated and stored in a secret.

```
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
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
    cert-manager.io/cluster-issuer: "letsencrypt-prod" # Or "letsencrypt-staging" to testing
    
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
```
kubectl apply -f argocd-ingress.yaml
```
## Install kube-state-metrics

This service provides cluster-level metrics for monitoring.

```
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install kube-state-metrics prometheus-community/kube-state-metrics --namespace kube-system --wait
```

## Check that all services are installed

```
kubectl get svc -A
```

**Expected output**

```
NAMESPACE        NAME                                 TYPE           CLUSTER-IP      EXTERNAL-IP    PORT(S)                      AGE
default          kubernetes                           ClusterIP      10.43.0.1       <none>         443/TCP                      10d
kube-system      kube-dns                             ClusterIP      10.43.0.10      <none>         53/UDP,53/TCP,9153/TCP       10d
kube-system      metrics-server                       ClusterIP      10.43.80.65     <none>         443/TCP                      10d
metallb-system   metallb-webhook-service              ClusterIP      10.43.240.70    <none>         443/TCP                      10d
ingress-nginx    ingress-nginx-controller-admission   ClusterIP      10.43.83.15     <none>         443/TCP                      10d
ingress-nginx    ingress-nginx-controller             LoadBalancer   10.43.223.157   46.62.142.55   80:31807/TCP,443:32063/TCP   10d
cert-manager     cert-manager-cainjector              ClusterIP      10.43.16.6      <none>         9402/TCP                     10d
cert-manager     cert-manager-webhook                 ClusterIP      10.43.76.11     <none>         443/TCP,9402/TCP             10d
cert-manager     cert-manager                         ClusterIP      10.43.54.169    <none>         9402/TCP                     10d
argocd           argocd-applicationset-controller     ClusterIP      10.43.177.231   <none>         7000/TCP                     10d
argocd           argocd-dex-server                    ClusterIP      10.43.100.250   <none>         5556/TCP,5557/TCP            10d
argocd           argocd-redis                         ClusterIP      10.43.121.24    <none>         6379/TCP                     10d
argocd           argocd-repo-server                   ClusterIP      10.43.93.82     <none>         8081/TCP                     10d
kube-system      kube-state-metrics                   ClusterIP      10.43.149.89    <none>         8080/TCP                     10d
argocd           argocd-server                        ClusterIP      10.43.230.107   <none>         80/TCP,443/TCP               10d
```

