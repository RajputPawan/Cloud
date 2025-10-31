# Kubernetes Multi-Master Multi-Node Test Application

This is a simple Python Flask application designed to test and demonstrate a multi-master multi-node Kubernetes cluster. The application provides pod and node information to help verify your cluster setup.

## Features

- Displays pod information including hostname, IP address, and node information
- Simple REST API endpoint at `/info`
- Containerized with Docker
- Kubernetes deployment configuration included

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Setting Up Kubernetes Cluster](#setting-up-kubernetes-cluster)
3. [Local Development](#local-development)
4. [Building the Docker Image](#building-the-docker-image)
5. [Deploying to Kubernetes](#deploying-to-kubernetes)
6. [Accessing the Application](#accessing-the-application)
7. [Verifying Multi-Node Deployment](#verifying-multi-node-deployment)
8. [Scaling the Application](#scaling-the-application)
9. [Monitoring](#monitoring)
10. [Troubleshooting](#troubleshooting)
11. [Cleaning Up](#cleaning-up)

## Prerequisites

### For Cluster Setup:
- At least 3 Linux machines (1 for etcd + 2 for master nodes) or VMs
- At least 2 worker nodes
- Ubuntu 20.04/22.04 LTS (recommended)
- 2+ GB RAM per machine
- 2+ vCPUs per machine
- Full network connectivity between all machines
- Swap disabled on all nodes
- Unique hostname, MAC address, and product_uuid for every node

### For Application Deployment:
- Docker installed on your local machine
- kubectl configured to access your Kubernetes cluster
- Python 3.9+ (for local testing)
- Helm (optional, for advanced deployments)

## Setting Up Kubernetes Cluster

### 1. System Configuration (All Nodes)

```bash
# Disable swap
sudo swapoff -a
sudo sed -i '/swap/d' /etc/fstab

# Set hostnames (run on each node with appropriate names)
sudo hostnamectl set-hostname <node-name>  # e.g., master-1, worker-1, etc.

# Update system packages
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# Add Docker repository
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# Configure Docker to use systemd as cgroup driver
sudo mkdir -p /etc/docker
cat <<EOF | sudo tee /etc/docker/daemon.json
{
  "exec-opts": ["native.cgroupdriver=systemd"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m"
  },
  "storage-driver": "overlay2"
}
EOF

# Restart Docker
sudo systemctl enable docker
sudo systemctl daemon-reload
sudo systemctl restart docker

# Add Kubernetes repository
curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add -
echo "deb https://apt.kubernetes.io/ kubernetes-xenial main" | sudo tee /etc/apt/sources.list.d/kubernetes.list

# Install kubelet, kubeadm, and kubectl
sudo apt update
sudo apt install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl
```

### 2. Initialize the First Master Node

```bash
# Initialize the control plane
sudo kubeadm init --control-plane-endpoint=<LOAD_BALANCER_IP>:<PORT> \
  --pod-network-cidr=10.244.0.0/16 \
  --upload-certs \
  --apiserver-advertise-address=<MASTER_NODE_IP>

# Set up kubeconfig
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# Install Pod Network Add-on (Flannel)
kubectl apply -f https://raw.githubusercontent.com/coreos/flannel/master/Documentation/kube-flannel.yml
```

### 3. Join Additional Master Nodes

Run the join command from the first master's output on each additional master node:

```bash
sudo kubeadm join <LOAD_BALANCER_IP>:<PORT> --token <token> \
  --discovery-token-ca-cert-hash <hash> \
  --control-plane --certificate-key <certificate-key>
```

### 4. Join Worker Nodes

Run the join command (from the first master's output) on each worker node:

```bash
sudo kubeadm join <LOAD_BALANCER_IP>:<PORT> --token <token> \
  --discovery-token-ca-cert-hash <hash>
```

### 5. Verify Cluster Status

On any master node:

```bash
kubectl get nodes
kubectl get pods --all-namespaces
```

## Local Development

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd k8s-test-app
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the application locally:
   ```bash
   python app.py
   ```

4. Access the application at `http://localhost:5000`

## Building the Docker Image

1. Build the Docker image:
   ```bash
   docker build -t k8s-test-app:1.0 .
   ```

2. (Optional) Tag and push to your container registry:
   ```bash
   # For Docker Hub
   docker tag k8s-test-app:1.0 <your-dockerhub-username>/k8s-test-app:1.0
   docker push <your-dockerhub-username>/k8s-test-app:1.0
   
   # For private registry
   docker tag k8s-test-app:1.0 <your-registry-address>/k8s-test-app:1.0
   docker push <your-registry-address>/k8s-test-app:1.0
   ```
   
   Update the image name in `k8s-deployment.yaml` if using a different registry.

## Deploying to Kubernetes

1. Ensure your kubeconfig is set correctly:
   ```bash
   kubectl config current-context
   kubectl get nodes
   ```

2. If you pushed the image to a private registry, create a secret:
   ```bash
   kubectl create secret docker-registry regcred \
     --docker-server=<your-registry-server> \
     --docker-username=<your-username> \
     --docker-password=<your-password> \
     --docker-email=<your-email>
   ```

3. Deploy the application:
   ```bash
   kubectl apply -f k8s-deployment.yaml
   ```

4. Verify the deployment:
   ```bash
   kubectl get deployments
   kubectl get pods -o wide
   kubectl get services
   ```

## Accessing the Application

### Method 1: Using NodePort (if LoadBalancer is not available)

1. Update the service type to NodePort in `k8s-deployment.yaml`:
   ```yaml
   apiVersion: v1
   kind: Service
   metadata:
     name: k8s-test-service
   spec:
     type: NodePort
     selector:
       app: k8s-test-app
     ports:
       - protocol: TCP
         port: 80
         targetPort: 5000
         nodePort: 30007
   ```

2. Apply the changes:
   ```bash
   kubectl apply -f k8s-deployment.yaml
   ```

3. Access the application using any node's IP address and the NodePort (30007):
   ```
   http://<node-ip>:30007
   ```

### Method 2: Using LoadBalancer (Cloud Providers)

1. Get the external IP:
   ```bash
   kubectl get service k8s-test-service
   ```

2. Access the application using the external IP:
   ```
   http://<external-ip>
   ```

### Method 3: Port Forwarding (For Testing)

```bash
kubectl port-forward svc/k8s-test-service 8080:80
```

Then access: `http://localhost:8080`

## Verifying Multi-Node Deployment

1. Check pod distribution across nodes:
   ```bash
   kubectl get pods -o wide
   ```

2. Access the `/info` endpoint multiple times to see different pod names (due to load balancing):
   ```bash
   curl http://<service-ip>/info
   ```

3. Check node resource usage:
   ```bash
   kubectl top nodes
   ```

## Scaling the Application

1. Scale the deployment:
   ```bash
   kubectl scale deployment k8s-test-app --replicas=5
   ```

2. Verify the new pods are distributed across nodes:
   ```bash
   kubectl get pods -o wide
   ```

## Monitoring

1. Deploy the Kubernetes Dashboard (optional):
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml
   kubectl proxy
   ```
   Access at: http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/

2. View application logs:
   ```bash
   # Get pod names
   kubectl get pods
   
   # View logs for a specific pod
   kubectl logs <pod-name>
   
   # Stream logs
   kubectl logs -f <pod-name>
   ```

## Troubleshooting

1. If pods are not starting:
   ```bash
   # Check pod status
   kubectl describe pod <pod-name>
   
   # Check events
   kubectl get events --sort-by='.metadata.creationTimestamp'
   ```

2. If nodes are not ready:
   ```bash
   # Check node status
   kubectl describe node <node-name>
   
   # Check kubelet status
   sudo systemctl status kubelet
   ```

3. If you encounter image pull errors:
   - Verify the image name and tag in the deployment
   - Check if you need to authenticate to a private registry
   - Ensure the image exists in the specified registry

## Cleaning Up

To remove the application and related resources:

```bash
# Delete the deployment and service
kubectl delete -f k8s-deployment.yaml

# Or delete by resource names
kubectl delete deployment k8s-test-app
kubectl delete service k8s-test-service

# To completely remove the Kubernetes cluster (on each node):
sudo kubeadm reset
sudo apt-get purge kubeadm kubectl kubelet kubernetes-cni kube*
sudo apt-get autoremove
sudo rm -rf ~/.kube
```

## License

MIT

## Local Development

1. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Run the application locally:
   ```
   python app.py
   ```

3. Access the application at `http://localhost:5000`

## Building the Docker Image

1. Build the Docker image:
   ```
   docker build -t k8s-test-app:1.0 .
   ```

2. Tag and push to your container registry (if needed):
   ```
   docker tag k8s-test-app:1.0 your-registry/k8s-test-app:1.0
   docker push your-registry/k8s-test-app:1.0
   ```
   
   Note: Update the image name in `k8s-deployment.yaml` if using a different registry.

## Deploying to Kubernetes

1. Apply the Kubernetes configuration:
   ```
   kubectl apply -f k8s-deployment.yaml
   ```

2. Check the deployment status:
   ```
   kubectl get pods
   kubectl get services
   ```

3. Access the application:
   - If using a cloud provider with LoadBalancer support, get the external IP:
     ```
     kubectl get service k8s-test-service
     ```
   - If using minikube:
     ```
     minikube service k8s-test-service
     ```

## Testing the Application

- Access the home page: `http://<service-ip>`
- Get pod information: `http://<service-ip>/info`

## Verifying Multi-Node Deployment

To verify that the pods are running on different nodes:

```bash
kubectl get pods -o wide
```

You should see the pods distributed across different nodes in your cluster.

## Cleaning Up

To remove the application from your cluster:

```bash
kubectl delete -f k8s-deployment.yaml
```

## License

MIT
