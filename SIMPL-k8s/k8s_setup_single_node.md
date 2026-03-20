# Kubernetes Setup for SIMPL data space components

This guide details the setup of a Kubernetes cluster using k3s for a single node (one computer) on an Ubuntu/Debian environment.
**Note** this assumes that the user is **not Root** and has sudo rights.

## Requirements for SIMPL

| Tool                   | Version | Notes            |
|:-----------------------|:--------|:-----------------|
| **Kubernetes**         | 1.29.x  | Using k3s, 1.33+ |
| **Git**                | 2.47.x+ |                  |
| **Helm**               | 4.x+    |                  |
| **LoadBalancer**       | N/A     | Using MetalLB    |
| **nginx-ingress**      | 1.10.x+ |                  |
| **cert-manager**       | 1.15.x+ |                  |
| **Argo CD**            | 2.11.x+ |                  |
| **nfs-provisioner**    | 4.0.x+  |                  |
| **kube-state-metrics** | 2.13.x+ |                  |

## Prerequisites (Server Setup)

Before installing k3s, we need to install helm (to manage applications) and git (for Argo CD).

### Install git
```shell
Update apt and install git  
sudo apt-get update  
sudo apt-get install git \-y
```

### Install Helm
```shell
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-4
chmod 700 get_helm.sh
./get_helm.sh
```

## **Step 1: Install k3s**

First, we install k3s itself. We use a version that corresponds to Kubernetes 1.29 and disable the built-in servicelb and traefik to use our own NGINX and MetalLB.

### Set the desired k3s version (based on k8s 1.3+)
```shell
export K3S_VERSION="v1.33.5+k3s1"
```
### Run the k3s installer
```shell
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=${K3S_VERSION} sh -s - server --disable=servicelb --disable=traefik --write-kubeconfig-mode=644
```

No versioning.
```shell
curl -sfL https://get.k3s.io | sh -s - server --disable=servicelb --disable=traefik --write-kubeconfig-mode=644
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

## Set Up NFS for ReadWriteMany (RWM) Volumes

### Check cluster IP range

**Note** *Since this is a single node setup (with only a WAN address), we are using the K3S cluster IP to map the NFS host.*
```shell
ip a | grep 10.42
```
*Expected output: You should see an interface (like cni0 or flannel.1) with the IP 10.42.0.1. The guide below uses 10.42.0.1 and the 10.42.0.0/24 subnet. If yours is different, adjust the IPs in the following steps.*

### Install and Configure the NFS Server

1. Update packages and install the NFS kernel server
```shell
sudo apt-get update  
sudo apt-get install nfs-kernel-server -y
```
2. Create the physical directory that will hold your persistent data
```shell
sudo mkdir -p /mnt/nfs_share
```
3. Set permissive ownership and permissions so pods can write to it
```shell
sudo chown nobody:nogroup /mnt/nfs_share 
sudo chmod 777 /mnt/nfs_share
```
4. Configure the export to ONLY allow traffic from the K3s internal subnet
```shell
echo "/mnt/nfs_share 10.42.0.0/24(rw,sync,no_subtree_check,no_root_squash)" | sudo tee /etc/exports
```
5. Apply the new export rules and restart the service
```shell
sudo exportfs -a
sudo systemctl restart nfs-kernel-server
```

### Deploy the NFS Provisioner via Helm

1. Add the official Helm repository
```shell
helm repo add nfs-subdir-external-provisioner https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner
helm repo update
```

2. Install the provisioner.
```shell
helm install nfs-provisioner nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
  --namespace nfs-provisioner \
  --create-namespace \
  --set nfs.server=10.42.0.1 \
  --set nfs.path=/mnt/nfs_share
```

### Make NFS the Default StorageClass (Recommended)

```shell
kubectl patch storageclass local-path -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
kubectl patch storageclass nfs-client -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
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
kubectl get pvc test-rwx-pvc
ls -l /mnt/nfs_share
```

Once verified, clean up the test.

```shell
kubectl delete -f test-nfs.yaml
```

This will create a StorageClass named nfs-client that your applications can use for RWM volumes.

## Install NGINX Ingress Controller

This will automatically ask MetalLB for the hosts public IP and bind it to ports 80/443.

```shell
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx --namespace ingress-nginx --create-namespace --wait
```

Wait for a moment and check that metalLB has provisioned the ingress controller (not the *ingress-nginx-controller-admission*) with an IP address.

```shell
kubectl get svc -n ingress-nginx
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
```

