# Kubernetes High-Availability Cluster Setup

This document provides a comprehensive guide to setting up a highly available Kubernetes cluster with the following components:
- 3 Master Nodes (Control Plane)
- 2 Worker Nodes
- 1 HAProxy Load Balancer

## Prerequisites

### Hardware Requirements
- All nodes: Minimum 2 vCPUs, 2GB RAM, 20GB disk
- Master nodes: Recommended 4 vCPUs, 4GB RAM, 40GB disk
- Worker nodes: Scale based on workload requirements
- Stable network connectivity between all nodes
- Unique hostname for each node
- SSH access to all nodes

### Network Requirements
- All nodes must be on the same network/VLAN
- Required ports must be open (see Kubernetes documentation)
- Unique static IP addresses for each node

## Node Information

| Hostname      | IP Address    | Role          |
|---------------|---------------|---------------|
| master-01     | 192.168.1.10  | Master        |
| master-02     | 192.168.1.11  | Master        |
| master-03     | 192.168.1.12  | Master        |
| worker-01     | 192.168.1.20  | Worker        |
| worker-02     | 192.168.1.21  | Worker        |
| haproxy-lb    | 192.168.1.100 | Load Balancer |

## 1. Initial Setup on All Nodes

### 1.1 Update System and Install Dependencies

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
