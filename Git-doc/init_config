Part1_Git Assignment Manual Dr.S.Udhayakumar (2).pdf >>> pdf .



Version control 
Check points ( commits)
Branches(Multiverse)
Synchronize ( Merging)


 apt get install git -y
 git --version 
 git config --global user.name "Pawan"
 git config --global user.email "pawan.ggit.."
 git init >>> In a specific dir which you wish to make repo for git.



	• After the git installation 
	•  git init  >>> to create .git file in pwd
	•  git add --a  >>> adding all the file from untracked to unmodified 
	• Make changes to the file(s)
	• Again add the file to the staging area by using 
	•  git add --a or git add filename

	•  git commit -m " comment" >> to make changes to the file(s)
	• After git commit the file will again be in unmodified area


	• We need to send the file(s) to the unmodified filed(staging area) to make them trackable
	• Then once we made changes to the file(s) they will become modified and will be ready to move in staged area 
	• To move the file(s) to staging area we use git add filename 

	• After it we can use git commit -m "comment" to make changes and send the file back to unmodified area .




LOG COMMANDS
 git log -p ( patch)
 git log --pretty=oneline
 git log --since=2.days
 git log --since=2.weeks
 git log --since=2.months

 git init
 git status 
 git commit -m " Message"
 git clone URL
 git add file_name
 git diff 
 git diff --staged 
 git rm --cached filename
 git mv oldfilename newfilename
 git mv move file to another path 

 git restore --staged filename



.gitignore 
This file is created in .git dir.
Adding any file_name to this file will mark the file as untracked 
NOTE: if a file is tracked or in staging area then we need to remove that file from staging are using 

 git rm --cached filename 

After that the file will not be tracked 
Eg: any changes made to the untracked file will not reflect in git status command output




 git pull https://github.com/RajputPawan/Cloud.git
fatal: unable to access 'https://github.com/RajputPawan/Cloud.git/': server certificate verification failed. CAfile: none CRLfile: none
git@Minion:~/cloud$ git config --global http.sslVerify false
git@Minion:~/cloud$ git config http.sslVerify false
git@Minion:~/cloud$ sudo apt-get update