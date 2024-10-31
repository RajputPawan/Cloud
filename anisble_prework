---
- hosts: all
  vars_files:
    - /satkhi/ansible/vault/ansible.yml
    - /satkhi/ansible/healthcheck/vars/global_vars.yml

  tasks:

 # Copying the Prework script from source to destination
    - name: Copying the Script from Src to Dest
      copy:
        src: /var/crash/scripts/precheckscript
        dest: /tmp/precheckscript
        mode: 0777

 # Executing the script in remote machines
    - name: Running Pre-work script
      shell: 'sh /tmp/precheckscript'

 # Copying out file from remote to local
    - name: copying output file from remote to local
      fetch:
        src: /tmp/precheckout_{{ ansible_hostname }}
        dest: /sles_upgrade/
        mode: 0777
        flat: yes
