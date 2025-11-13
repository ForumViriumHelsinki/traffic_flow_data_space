# Kubernetes Setup for SIMPL data space components

This guide details the setup of a Kubernetes cluster using k3s for multiple computers on an Rocky Linux 9 environment.
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

## Prerequisites (Run on ALL 3 nodes)

### Update System and Install Tools
```
sudo dnf update -y
sudo dnf install git curl nfs-utils -y
```

### Install Helm

```
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh
```

## Firewall option A: Disable firewalld

For simplicity, disable firewalld to allow k3s and NFS to communicate freely on the private network.

```
sudo systemctl stop firewalld
sudo systemctl disable firewalld
```

## Firewall option b: Configure firewalld (!!NOT TESTED!!)

Instead of disabling the firewall, configure it on each node to allow necessary k3s and NFS traffic from the private subnet.

**NOTE** This configuration uses *eth0* as the network interface, change if needed.

### On the Control Plane Node

```
# Set your private network interface name
IFACE="eth0"

# Start and enable firewalld
sudo systemctl enable --now firewalld

# Create a new 'k8s' zone and assign the private network/interface to it
sudo firewall-cmd --permanent --new-zone=k8s
sudo firewall-cmd --permanent --zone=k8s --add-source=192.168.220.0/24
sudo firewall-cmd --permanent --add-interface=${IFACE} --zone=k8s

# Add k3s server and agent ports to the k8s zone
sudo firewall-cmd --permanent --zone=k8s --add-port=6443/tcp     # k3s API Server
sudo firewall-cmd --permanent --zone=k8s --add-port=8472/udp     # Flannel VXLAN
sudo firewall-cmd --permanent --zone=k8s --add-port=10250/tcp    # kubelet

# Add NFS server ports to the k8s zone
sudo firewall-cmd --permanent --zone=k8s --add-service=nfs
sudo firewall-cmd --permanent --zone=k8s --add-service=rpc-bind
sudo firewall-cmd --permanent --zone=k8s --add-service=mountd

# Reload the firewall to apply all permanent rules
sudo firewall-cmd --reload

# Set the default zone to 'public'
sudo firewall-cmd --set-default-zone=public
```

### On BOTH Worker Nodes

```
# Set your private network interface name
IFACE="eth0"

# Start and enable firewalld
sudo systemctl enable --now firewalld

# Create a new 'k8s' zone and assign the private network/interface to it
sudo firewall-cmd --permanent --new-zone=k8s
sudo firewall-cmd --permanent --zone=k8s --add-source=192.168.220.0/24
sudo firewall-cmd --permanent --add-interface=${IFACE} --zone=k8s

# Add k3s agent ports to the k8s zone
sudo firewall-cmd --permanent --zone=k8s --add-port=8472/udp       # Flannel VXLAN
sudo firewall-cmd --permanent --zone=k8s --add-port=10250/tcp      # kubelet

# Add NodePort range for services
sudo firewall-cmd --permanent --zone=k8s --add-port=30000-32767/tcp
sudo firewall-cmd --permanent --zone=k8s --add-port=30000-32767/udp

# Add NFS client services
sudo firewall-cmd --permanent --zone=k8s --add-service=rpc-bind
sudo firewall-cmd --permanent --zone=k8s --add-service=mountd

# Reload the firewall to apply all permanent rules
sudo firewall-cmd --reload

# Set the default zone to 'public'
sudo firewall-cmd --set-default-zone=public
```

**Cesar, start from here**

## Cluster installation

Begin by installing the Kubernetes control plane.

### On control plane

```
# Set the desired k3s version (based on k8s 1.29)
export K3S_VERSION="v1.30.14+k3s2"

# Run the k3s installer
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=${K3S_VERSION} sh -s - server \
    --disable=servicelb \
    --disable=traefik \
    --write-kubeconfig-mode=644 \
    --node-ip=192.168.220.175 \
    --flannel-iface=eth0
```

#### Get the control plane token

This is used with the worker node adoption, store the token for further use.

```
sudo cat /var/lib/rancher/k3s/server/node-token
```

### On worker nodes

Install the worker nodes using the control plane token.

```
# Set the k3s version to match the server
export K3S_VERSION="v1.30.14+k3s2"

curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=${K3S_VERSION} \
    K3S_URL=192.168.220.175:6443 \
    K3S_TOKEN="CONTROL_PLANE_NODE_TOKEN" \
    sh -s - agent\
    --node-ip=<ADD_WORKER_NODE_IP> \
    --flannel-iface=eth0
```

### Cluster configuration

from now on, *kubectl* and *helm* commands are executed on the control plane, nodes on worker nodes are provisioned as needed.

#### Kubernetes access

```
# Set the KUBECONFIG variable in current session
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Add KUBECONFIG to .bashrc to make it permanent
echo "export KUBECONFIG=/etc/rancher/k3s/k3s.yaml" >> ~/.bashrc
source ~/.bashrc

# Verify the cluster is running
kubectl get nodes
```

Expected output should be:

```
NAME           STATUS   ROLES                  AGE   VERSION
control-plane  Ready    control-plane,master   90s   v1.29.5+k3s1
worker-node-1  Ready    <none>                 60s   v1.29.5+k3s1
worker-node-2  Ready    <none>                 60s   v1.29.5+k3s1
```

### MetalLB installation and configuration

MetalLB will assign private Cluster IP addresses from your network to services.

```
helm repo add metallb https://metallb.github.io/metallb
helm repo update
helm install metallb metallb/metallb --namespace metallb-system --create-namespace --wait
```

#### Create MetalLB configuration

Create a *metallb-config.yaml* configuration file.

**NOTE** the address pool only uses the control plane IP, since there is no unassigned IP pool available. This way the control plane works as the gateway to the private cluster network. 

```
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: default-pool
  namespace: metallb-system
spec:
  addresses:
  - 192.168.220.175/32
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
Apply the configuration
```
kubectl apply -f metallb-config.yaml
```

### Configure NFS server

This needs to be done on the control plane computer

```
# Enable and start the nfs-server service
sudo systemctl enable --now nfs-server

# Create the directory to share
sudo mkdir -p /mnt/nfs_share
sudo chown nobody:nogroup /mnt/nfs_share
sudo chmod 777 /mnt/nfs_share

# Configure and apply export (allows access from the whole subnet) / This might appropriate for testing, but not in production.
echo "/mnt/nfs_share 192.168.220.0/24(rw,sync,no_subtree_check,no_root_squash)" | sudo tee /etc/exports

# Refresh the NFS exports
sudo exportfs -a
sudo systemctl restart nfs-server
```

#### 2. Install Kubernetes NFS Provisioner

This should be pointed at the control plane IP.

```
helm repo add nfs-subdir-external-provisioner https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner
helm repo update
helm install nfs-provisioner nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
    --namespace nfs-provisioner \
    --create-namespace \
    --set nfs.server=192.168.220.175 \
    --set nfs.path=/mnt/nfs_share
```

### Install Nginx ingress controller

```
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx --namespace ingress-nginx --create-namespace --wait
```

#### Configure Nginx ingress controller to use control plane IP for load balancing.

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

#### Why are we doing it this way?

In our use case, the control plane and workers are located in a private network that does not have a free IP address pool available.

### Install the certification manager

```
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager --namespace cert-manager --create-namespace --set crds.enabled=true --wait
```

### Install ArgoCD

```
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
helm install argocd argo/argo-cd --namespace argocd --create-namespace --wait
```

#### Get the ArgoCD initial password

Safe this token

```
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

#### Configure UI access

Create a argocd-ingress.yaml file for network access.

**NOTE** This needs a domain, with preferably a wildcard DNS A-record.

```
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-server-ingress
  namespace: argocd
  annotations:
    nginx.ingress.kubernetes.io/backend-protocol: "HTTPS"
    nginx.ingress.kubernetes.io*emphasized text*.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  rules:
  - host: argocd.to.domain # Update this.
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: argocd-server
            port:
              name: https
```

Apply the configuration

```
kubectl apply -f argocd-ingress.yaml
```

### Install kube-state-metrics

```
helm repo add prometheus-community [https://prometheus-community.github.io/helm-charts](https://prometheus-community.github.io/helm-charts)
helm repo update
helm install kube-state-metrics prometheus-community/kube-state-metrics --namespace kube-system --wait
```

### Cheack services status

```
kubectl get svc -A
```
