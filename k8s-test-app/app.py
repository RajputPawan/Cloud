from flask import Flask, jsonify
import socket
import os
import platform
import datetime

app = Flask(__name__)

@app.route('/')
def home():
    return "Welcome to Kubernetes Test Application. Use /info endpoint to see pod details."

@app.route('/info')
def get_info():
    hostname = socket.gethostname()
    ip_address = socket.gethostbyname(hostname)
    
    return jsonify({
        'hostname': hostname,
        'ip_address': ip_address,
        'platform': platform.platform(),
        'python_version': platform.python_version(),
        'current_time': datetime.datetime.utcnow().isoformat(),
        'pod_name': os.environ.get('POD_NAME', 'Not running in Kubernetes'),
        'node_name': os.environ.get('NODE_NAME', 'Not running in Kubernetes'),
        'namespace': os.environ.get('POD_NAMESPACE', 'default')
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
