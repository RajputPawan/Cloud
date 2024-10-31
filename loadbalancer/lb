	• Load balancer is a server which is used to route the incoming traffic to the downstream server/machines/VM's 
	• Load balancers have static hostname do not resolve and use underlying IP.
	• LB can scale but not instantaneously ask AWS for warm-up.
	• It is a single point of contact for the Client
	• It has single DNS for application
	• LB maintains the Fault tolerance and HA 
	• There should be at-least 2AZ's configured with the LB to maintain the fault tolerance and HA 
	• VM's should be launched in those AZ's to receive the incoming traffic. 
	• Regular health checks of the VM's and route the incoming traffic to the healthy VM's
	• Handles the VM failures 
	• Keeps the Public traffic separate from the Private traffic.
	• Maintains the stickiness to the instances.
	• If we have a VM running in some region us-east-1a and the AZ is not configured with the LB then LB will not be able to route the traffic to the VM's
	• 4xxx are client induced errors
	• 5xxx are application induced errors.
	• LB error 503 check the capacity or target attached to LB.
	• If LB is not connecting to application check the SG.




HEALTH CHECK 
	• If the route and the port configuration return 200 OK then only LB will route the incoming traffic to the instance.

LB'S TYPES 
	• Application LB (ALB)
	• Network LB(NLB)
	• Classic LB(CLB)
	• Gateway LB(GLWB)

Application Load balancer
	• Works on Layer -7 Application Layer of OSI model
	• Uses HTTP/HTTPS configured at port 80 gRPG protocols and websokets protocols.
	• The application servers don't see the IP's of the client directly 
	• It has static DNS name .
	• ALB does the connection termination and exposes it's private ip to the instance 
	• The true IP of the Client is added to the header of the X-forwarded-for 
	• Dynamic port mapping
	• Good for Microservices and Containers.
	• Stickiness can be enabled at the target group level( Same request route to same Target group)
	• Stickiness is generated from the ALB.
	

Network Load balancer
	• It works at Layer - 4 of the OSI model 
	• Works on TCP/UDP protocol
	• It works better than ALB 
	• It has static IP address.
	• It is capable to handle millions of the request per second.
	• Supports static and elastic IP.
	• NLB directly sees the client IP
	

Gateway Load balancer
	• It acts a third party certificate validator.
	• It receives the traffic and validates the certificate and routes the traffic to the VM's accordingly.
