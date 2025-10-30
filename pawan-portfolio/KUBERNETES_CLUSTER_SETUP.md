# Kubernetes High-Availability Cluster Setup

This document provides a clear, node-by-node guide for setting up a highly available Kubernetes cluster.

## Cluster Architecture

### Network Layout
```
┌─────────────────┐     ┌─────────────────────────────────────────────────────────┐
│                 │     │                    Kubernetes Cluster                   │
│  External       │     │  ┌───────────┐    ┌──────────┐    ┌──────────┐         │
│  Clients        ├─────┼─►│  HAProxy  │    │          │    │          │         │
│                 │     │  │ Load      ├───►│ Master-01 │◄───┤  etcd    │         │
└─────────────────┘     │  │ Balancer  │    │          │    │  Cluster │         │
                        │  └───────────┘    └────┬─────┘    │ (3 nodes)│         │
                        │       ▲                │           │          │         │
                        │       │                ▼           │          │         │
                        │  ┌────┴─────┐    ┌────┴─────┐    ┌┴──────────┴─┐       │
                        │  │          │    │          │    │             │       │
                        │  │ Master-02 │◄──┼─►Master-03│    │  Worker-01  │       │
                        │  │          │    │          │    │             │       │
                        │  └──────────┘    └──────────┘    └─────────────┘       │
                        │                                ▲                       │
                        │                                │                       │
                        │                        ┌───────┴────────┐              │
                        │                        │                │              │
                        │                  ┌─────┴────┐     ┌─────┴─────┐        │
                        │                  │          │     │           │        │
                        └──────────────────┤ Worker-02 │     │  Worker-03 │        │
                                           │          │     │           │        │
                                           └──────────┘     └───────────┘        │
                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Node Details
- **Load Balancer (1 node)**
  - Hostname: haproxy-lb
  - IP: <HAPROXY_IP>
  - Role: Load balances traffic to master nodes

- **Control Plane (3 nodes)**
  - Hostnames: master-01, master-02, master-03
  - IPs: <MASTER01_IP>, <MASTER02_IP>, <MASTER03_IP>
  - Components: kube-apiserver, kube-controller-manager, kube-scheduler, etcd

- **Worker Nodes (2 nodes)**
  - Hostnames: worker-01, worker-02
  - IPs: <WORKER01_IP>, <WORKER02_IP>
  - Components: kubelet, kube-proxy, container runtime

### Traffic Flow
1. External clients connect to the HAProxy load balancer
2. HAProxy distributes traffic to healthy master nodes
3. Master nodes manage the cluster state and schedule workloads
4. Worker nodes run the actual containerized applications
5. etcd cluster maintains the cluster state across all master nodes

### High Availability
- **Master Nodes**: 3-node etcd cluster for quorum
- **Load Balancer**: Single point of failure (consider adding redundancy in production)
- **Worker Nodes**: Stateless, can be scaled as needed

# Prerequisites

## Hardware Requirements
- **All nodes**: Minimum 2 vCPUs, 2GB RAM, 20GB disk
- **Master nodes**: Recommended 4 vCPUs, 4GB RAM, 40GB disk
- **Worker nodes**: Scale based on workload requirements
- **HAProxy LB**: 2 vCPUs, 2GB RAM, 20GB disk

## Network Requirements
- All nodes must be on the same network/VLAN
- Required ports must be open between all nodes:
  - TCP: 6443 (Kubernetes API server)
  - TCP: 2379-2380 (etcd server client API)
  - TCP: 10250 (Kubelet API)
  - TCP: 10259 (kube-scheduler)
  - TCP: 10257 (kube-controller-manager)
  - TCP: 179 (Calico networking)
  - TCP: 4789 (VXLAN overlay network)
  - TCP: 5473 (Calico networking)
  - TCP: 9099 (Calico health check)
  - TCP: 30000-32767 (NodePort Services)

## Node Information

# Node-Specific Configuration

## 1. HAProxy Load Balancer Setup (haproxy-lb: 192.168.1.100)

```bash
# 1. Set hostname
sudo hostnamectl set-hostname haproxy-lb

# 2. Update system
sudo apt update && sudo apt upgrade -y

# 3. Install HAProxy
sudo apt install -y haproxy

# 4. Configure HAProxy
cat <<EOF | sudo tee /etc/haproxy/haproxy.cfg
# Global settings
global
    log /dev/log local0
    log /dev/log local1 notice
    daemon
    maxconn 4096

# Default settings
defaults
    log     global
    mode    tcp
    option  tcplog
    option  dontlognull
    retries 3
    option redispatch
    timeout connect 5000
    timeout client 50000
    timeout server 50000

# Frontend configuration for Kubernetes API
frontend kubernetes
    bind 192.168.1.100:6443
    option tcplog
    mode tcp
    default_backend kubernetes-master-nodes

# Backend configuration for master nodes
backend kubernetes-master-nodes
    mode tcp
    balance roundrobin
    option tcp-check
    server master-01 192.168.1.10:6443 check fall 3 rise 2
    server master-02 192.168.1.11:6443 check fall 3 rise 2
    server master-03 192.168.1.12:6443 check fall 3 rise 2
EOF

# 5. Restart and enable HAProxy
sudo systemctl restart haproxy
sudo systemctl enable haproxy

# 6. Verify HAProxy status
sudo systemctl status haproxy
```

## 2. Master Node Setup (Run on all master nodes: master-01, master-02, master-03)

### Common Setup (Run on all master nodes)

```bash
# 1. Set hostname (run on each master with correct hostname)
sudo hostnamectl set-hostname master-0X  # Replace with actual hostname (01, 02, 03)

# 2. Update system and install dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# 3. Disable swap
sudo swapoff -a
sudo sed -i '/ swap / s/^.*$/# \0/' /etc/fstab

# 4. Load kernel modules
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter

# 5. Configure system parameters
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF

sudo sysctl --system

# 6. Install containerd
sudo apt update
sudo apt install -y containerd
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
sudo systemctl restart containerd
sudo systemctl enable containerd

# 7. Add Kubernetes repository
sudo curl -fsSLo /usr/share/keyrings/kubernetes-archive-keyring.gpg https://packages.cloud.google.com/apt/doc/apt-key.gpg
echo "deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://apt.kubernetes.io/ kubernetes-xenial main" | sudo tee /etc/apt/sources.list.d/kubernetes.list

# 8. Install kubelet, kubeadm, and kubectl
K8S_VERSION=1.24.0-00
sudo apt update
sudo apt install -y kubelet=$K8S_VERSION kubeadm=$K8S_VERSION kubectl=$K8S_VERSION
sudo apt-mark hold kubelet kubeadm kubectl
sudo systemctl enable --now kubelet
```

### Initialize First Master (Run ONLY on master-01)

```bash
# 1. Initialize the Kubernetes control plane
sudo kubeadm init --control-plane-endpoint="192.168.1.100:6443" \
    --upload-certs \
    --pod-network-cidr=10.244.0.0/16 \
    --apiserver-advertise-address=192.168.1.10

# 2. Set up kubeconfig (as regular user)
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# 3. Install Flannel network add-on
kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml

# 4. Get join commands for other nodes
echo "Control Plane Join Command:"
echo "Run this on other master nodes (master-02, master-03):"
kubeadm token create --print-join-command --ttl=0

echo "Worker Node Join Command:"
echo "Run this on worker nodes (worker-01, worker-02):"
echo "kubeadm join 192.168.1.100:6443 --token $(kubeadm token create) --discovery-token-ca-cert-hash $(openssl x509 -pubkey -in /etc/kubernetes/pki/ca.crt | openssl rsa -pubin -outform der 2>/dev/null | openssl dgst -sha256 -hex | sed 's/^.* //')"
```

### Join Additional Masters (Run on master-02 and master-03)

```bash
# Run the control plane join command from master-01 output
# It will look like:
sudo kubeadm join 192.168.1.100:6443 --token <token> \
    --discovery-token-ca-cert-hash <hash> \
    --control-plane --certificate-key <key>

# Set up kubeconfig
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

## 3. Worker Node Setup (Run on worker-01 and worker-02)

```bash
# 1. Set hostname (run on each worker with correct hostname)
sudo hostnamectl set-hostname worker-0X  # Replace with 01 or 02

# 2. Update system and install dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# 3. Disable swap
sudo swapoff -a
sudo sed -i '/ swap / s/^.*$/# \0/' /etc/fstab

# 4. Load kernel modules
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter

# 5. Configure system parameters
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF

sudo sysctl --system

# 6. Install containerd
sudo apt update
sudo apt install -y containerd
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
sudo systemctl restart containerd
sudo systemctl enable containerd

# 7. Add Kubernetes repository
sudo curl -fsSLo /usr/share/keyrings/kubernetes-archive-keyring.gpg https://packages.cloud.google.com/apt/doc/apt-key.gpg
echo "deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://apt.kubernetes.io/ kubernetes-xenial main" | sudo tee /etc/apt/sources.list.d/kubernetes.list

# 8. Install kubelet and kubeadm
K8S_VERSION=1.24.0-00
sudo apt update
sudo apt install -y kubelet=$K8S_VERSION kubeadm=$K8S_VERSION
sudo apt-mark hold kubelet kubeadm
sudo systemctl enable --now kubelet

# 9. Join the cluster (use the worker join command from master-01)
# Example (use the actual command from master-01):
sudo kubeadm join 192.168.1.100:6443 --token <token> \
    --discovery-token-ca-cert-hash <hash>
```

## 4. Verify Cluster Status (Run on any master node)

```bash
# Check nodes
kubectl get nodes -o wide

# Check component status
kubectl get cs

# Check pods in kube-system namespace
kubectl get pods -n kube-system -o wide
```

## 5. Install Kubernetes Dashboard (Optional)

```bash
# Install dashboard
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.5.0/aio/deploy/recommended.yaml

# Create admin user
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: admin-user
  namespace: kubernetes-dashboard
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: admin-user
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- kind: ServiceAccount
  name: admin-user
  namespace: kubernetes-dashboard
EOF

# Get the token for dashboard login
echo "Dashboard Token:"
kubectl -n kubernetes-dashboard get secret $(kubectl -n kubernetes-dashboard get sa/admin-user -o jsonpath="{.secrets[0].name}") -o go-template="{{.data.token | base64decode}}"

# Access the dashboard at:
# https://<master-ip>:<node-port>/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/
```

## Phase 1: Initial Setup on All Nodes

### Step 1: Configure All Nodes

Run these commands on **ALL NODES** (master-01, master-02, master-03, worker-01, worker-02, haproxy-lb):

```bash
# 1. Set hostnames (run on each node with its respective hostname)
sudo hostnamectl set-hostname <node-hostname>  # Replace with actual hostname (e.g., master-01)

# 2. Update system and install dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# 3. Disable swap
sudo swapoff -a
sudo sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab

# 4. Configure kernel modules
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

# 5. Load kernel modules
sudo modprobe overlay
sudo modprobe br_netfilter

# 6. Configure system parameters
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF

# 7. Apply sysctl parameters
sudo sysctl --system
```

## Phase 2: HAProxy Load Balancer Setup

### Step 2: Configure HAProxy on haproxy-lb (192.168.1.100)

```bash
# 1. Install HAProxy
sudo apt update
sudo apt install -y haproxy

# 2. Configure HAProxy
cat <<EOF | sudo tee /etc/haproxy/haproxy.cfg
frontend kubernetes
    bind 192.168.1.100:6443
    option tcplog
    mode tcp
    default_backend kubernetes-master-nodes

backend kubernetes-master-nodes
    mode tcp
    balance roundrobin
    option tcp-check
    server master-01 192.168.1.10:6443 check fall 3 rise 2
    server master-02 192.168.1.11:6443 check fall 3 rise 2
    server master-03 192.168.1.12:6443 check fall 3 rise 2
EOF

# 3. Restart and enable HAProxy
sudo systemctl restart haproxy
sudo systemctl enable haproxy
```

## Phase 3: Container Runtime Setup

### Step 3: Install containerd on All Nodes

Run these commands on **ALL NODES**:

```bash
# 1. Install containerd
sudo apt-get update
sudo apt-get install -y containerd

# 2. Configure containerd
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml

# 3. Set cgroup driver to systemd
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml

# 4. Restart and enable containerd
sudo systemctl restart containerd
sudo systemctl enable containerd
```

## Phase 4: Kubernetes Components Installation

### Step 4: Install kubeadm, kubelet, and kubectl on All Nodes

Run these commands on **ALL NODES**:

```bash
# 1. Add Kubernetes repository
sudo curl -fsSLo /usr/share/keyrings/kubernetes-archive-keyring.gpg https://packages.cloud.google.com/apt/doc/apt-key.gpg
echo "deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://apt.kubernetes.io/ kubernetes-xenial main" | sudo tee /etc/apt/sources.list.d/kubernetes.list

# 2. Update package list
sudo apt-get update

# 3. Install Kubernetes components (specify version)
K8S_VERSION=1.24.0-00
sudo apt-get install -y kubelet=$K8S_VERSION kubeadm=$K8S_VERSION kubectl=$K8S_VERSION

# 4. Prevent automatic updates
sudo apt-mark hold kubelet kubeadm kubectl

# 5. Enable kubelet
sudo systemctl enable --now kubelet
```

## Phase 5: Initialize the First Master Node

### Step 5: Initialize Control Plane on master-01 (192.168.1.10)

Run these commands **ONLY on master-01**:

```bash
# 1. Initialize the Kubernetes control plane
sudo kubeadm init --control-plane-endpoint="192.168.1.100:6443" \
    --upload-certs \
    --pod-network-cidr=10.244.0.0/16 \
    --apiserver-advertise-address=192.168.1.10

# 2. Set up kubeconfig (as regular user)
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# 3. Install Flannel network add-on
kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml
```

### Step 6: Get Join Commands from master-01

On **master-01**, run these commands and save the output:

```bash
# Get control plane join command
echo "Control Plane Join Command:"
kubeadm token create --print-join-command --ttl=0

# Get worker join command (without --control-plane flag)
echo "Worker Node Join Command:"
echo "kubeadm join 192.168.1.100:6443 --token $(kubeadm token create) --discovery-token-ca-cert-hash $(openssl x509 -pubkey -in /etc/kubernetes/pki/ca.crt | openssl rsa -pubin -outform der 2>/dev/null | openssl dgst -sha256 -hex | sed 's/^.* //')"
```

## Phase 6: Join Additional Master Nodes

### Step 7: Join master-02 (192.168.1.11) to the Cluster

On **master-02**, run the control plane join command obtained from Step 6. It should look like:

```bash
sudo kubeadm join 192.168.1.100:6443 --token <token> \
    --discovery-token-ca-cert-hash <hash> \
    --control-plane --certificate-key <key>

# Set up kubeconfig
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

### Step 8: Join master-03 (192.168.1.12) to the Cluster

On **master-03**, run the same control plane join command as in Step 7.

## Phase 7: Join Worker Nodes

### Step 9: Join worker-01 (192.168.1.20) to the Cluster

On **worker-01**, run the worker join command obtained from Step 6:

```bash
sudo kubeadm join 192.168.1.100:6443 --token <token> \
    --discovery-token-ca-cert-hash <hash>
```

### Step 10: Join worker-02 (192.168.1.21) to the Cluster

On **worker-02**, run the same worker join command as in Step 9.

## Phase 8: Verify Cluster Status

On **any master node** (master-01, master-02, or master-03), run:

```bash
# Check nodes
kubectl get nodes -o wide

# Check component status
kubectl get cs

# Check pods in kube-system namespace
kubectl get pods -n kube-system -o wide
```

## Next Steps

1. **Install Network Policy Provider** (if needed):
   ```bash
   # Example: Install Calico
   kubectl create -f https://docs.projectcalico.org/manifests/tigera-operator.yaml
   kubectl create -f https://docs.projectcalico.org/manifests/custom-resources.yaml
   ```

2. **Install Kubernetes Dashboard** (optional):
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.5.0/aio/deploy/recommended.yaml
   ```

3. **Set Up Storage Class** (if needed):
   ```bash
   # Example: Install NFS provisioner
   kubectl create namespace nfs-provisioner
   helm repo add nfs-subdir-external-provisioner https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner/
   helm install nfs-subdir-external-provisioner nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
       --namespace nfs-provisioner \
       --set nfs.server=<nfs-server-ip> \
       --set nfs.path=/exported/path
   ```

## Troubleshooting

### Common Issues

1. **Node Not Ready**
   - Check kubelet status: `systemctl status kubelet`
   - Check container runtime: `systemctl status containerd`
   - Check network plugin pods: `kubectl get pods -n kube-system`

2. **Network Issues**
   - Verify network plugin is installed correctly
   - Check if required ports are open between nodes
   - Verify pod network CIDR doesn't conflict with host network

3. **HAProxy Issues**
   - Check HAProxy status: `systemctl status haproxy`
   - Verify load balancer configuration
   - Check if API server is accessible through the load balancer

```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
```

### 1.2 Disable Swap

```bash
# Disable swap immediately
sudo swapoff -a

# Comment out swap in /etc/fstab
sudo sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab
```

### 1.3 Configure Kernel Modules and System Parameters

```bash
# Load required kernel modules
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

# Load modules
sudo modprobe overlay
sudo modprobe br_netfilter

# Set system parameters for Kubernetes
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF

# Apply sysctl params without reboot
sudo sysctl --system
```

## 2. Install Container Runtime (containerd)

### 2.1 Install containerd

```bash
# Install required packages
sudo apt-get update
sudo apt-get install -y containerd

# Configure containerd
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml

# Set cgroup driver to systemd
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml

# Restart containerd
sudo systemctl restart containerd
sudo systemctl enable containerd
```

## 3. Install kubeadm, kubelet and kubectl

### 3.1 Add Kubernetes Repository

```bash
# Add Google Cloud public signing key
sudo curl -fsSLo /usr/share/keyrings/kubernetes-archive-keyring.gpg https://packages.cloud.google.com/apt/doc/apt-key.gpg

# Add Kubernetes apt repository
echo "deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://apt.kubernetes.io/ kubernetes-xenial main" | sudo tee /etc/apt/sources.list.d/kubernetes.list

# Update package list
sudo apt-get update
```

### 3.2 Install Kubernetes Components

```bash
# Install specific version (example: 1.24.0-00)
K8S_VERSION=1.24.0-00
sudo apt-get install -y kubelet=$K8S_VERSION kubeadm=$K8S_VERSION kubectl=$K8S_VERSION

# Prevent automatic updates
sudo apt-mark hold kubelet kubeadm kubectl

# Enable kubelet
sudo systemctl enable --now kubelet
```

## 4. HAProxy Load Balancer Setup

On the `haproxy-lb` node:

### 4.1 Install HAProxy

```bash
sudo apt update
sudo apt install -y haproxy
```

### 4.2 Configure HAProxy

Edit the HAProxy configuration file:

```bash
sudo nano /etc/haproxy/haproxy.cfg
```

Add the following configuration:

```
frontend kubernetes
    bind 192.168.1.100:6443
    option tcplog
    mode tcp
    default_backend kubernetes-master-nodes

backend kubernetes-master-nodes
    mode tcp
    balance roundrobin
    option tcp-check
    server master-01 192.168.1.10:6443 check fall 3 rise 2
    server master-02 192.168.1.11:6443 check fall 3 rise 2
    server master-03 192.168.1.12:6443 check fall 3 rise 2
```

### 4.3 Restart HAProxy

```bash
sudo systemctl restart haproxy
sudo systemctl enable haproxy
```

## 5. Initialize the First Master Node

On `master-01`:

### 5.1 Initialize the Control Plane

```bash
# Initialize the Kubernetes control plane
sudo kubeadm init --control-plane-endpoint="192.168.1.100:6443" \
    --upload-certs \
    --pod-network-cidr=10.244.0.0/16 \
    --apiserver-advertise-address=192.168.1.10
```

### 5.2 Set Up kubeconfig

```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

### 5.3 Install Pod Network Add-on (Flannel)

```bash
kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml
```

## 6. Join Additional Master Nodes

On `master-02` and `master-03`, run the join command generated in step 5.1. It will look similar to:

```bash
sudo kubeadm join 192.168.1.100:6443 --token <token> \
    --discovery-token-ca-cert-hash <hash> \
    --control-plane --certificate-key <key>
```

## 7. Join Worker Nodes

On `worker-01` and `worker-02`, run the worker join command (without the `--control-plane` flag):

```bash
sudo kubeadm join 192.168.1.100:6443 --token <token> \
    --discovery-token-ca-cert-hash <hash>
```

## 8. Verify Cluster Status

On any master node:

```bash
# Check nodes
kubectl get nodes

# Check component status
kubectl get cs

# Check pods in kube-system namespace
kubectl get pods -n kube-system
```

## 9. Install Kubernetes Dashboard (Optional)

```bash
# Deploy dashboard
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.5.0/aio/deploy/recommended.yaml

# Create admin user
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: admin-user
  namespace: kubernetes-dashboard
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: admin-user
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- kind: ServiceAccount
  name: admin-user
  namespace: kubernetes-dashboard
EOF

# Get the token for dashboard login
echo "Dashboard Token:"
kubectl -n kubernetes-dashboard get secret $(kubectl -n kubernetes-dashboard get sa/admin-user -o jsonpath="{.secrets[0].name}") -o go-template="{{.data.token | base64decode}}"

# Access the dashboard at:
# https://<node-ip>:<node-port>/
# Use the token from above to log in
```

## 10. Backup and Recovery

### 10.1 Backup etcd

On a master node:

```bash
# Create backup directory
sudo mkdir -p /opt/etcd-backups

# Create backup
sudo ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /opt/etcd-backups/etcd-snapshot-$(date +%Y%m%d).db
```

## Troubleshooting

### Common Issues

1. **Node Not Ready**
   - Check kubelet status: `systemctl status kubelet`
   - Check container runtime: `systemctl status containerd`
   - Check network plugin pods: `kubectl get pods -n kube-system`

2. **Network Issues**
   - Verify network plugin is installed correctly
   - Check if required ports are open between nodes
   - Verify pod network CIDR doesn't conflict with host network

3. **HAProxy Issues**
   - Check HAProxy status: `systemctl status haproxy`
   - Verify load balancer configuration
   - Check if API server is accessible through the load balancer

## Security Considerations

1. **Network Security**
   - Use network policies to restrict pod-to-pod communication
   - Implement network segmentation
   
2. **Authentication & Authorization**
   - Use RBAC effectively
   - Implement network policies
   - Regularly rotate certificates

3. **Updates**
   - Regularly update Kubernetes components
   - Keep the host OS updated
   - Monitor for CVEs in container images

## Maintenance

### Upgrading Kubernetes

1. Upgrade kubeadm on all master nodes
2. Upgrade control plane components
3. Upgrade worker nodes
4. Verify cluster functionality

### Adding/Removing Nodes

**To add a new worker node:**
1. Follow the initial setup steps
2. Run the join command from step 7

**To remove a node:**
```bash
# On a master node
kubectl drain <node-name> --delete-local-data --force --ignore-daemonsets
kubectl delete node <node-name>

# On the node being removed
sudo kubeadm reset
```

## Conclusion

This guide provides a complete setup for a highly available Kubernetes cluster. For production environments, consider additional configurations such as:

- Persistent storage solutions
- Monitoring and logging
- Backup and disaster recovery
- Security hardening
- Network policies

For more information, refer to the official Kubernetes documentation: https://kubernetes.io/docs/home/
