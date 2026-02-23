import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    print("Connecting to 10.0.124.46...")
    ssh.connect('10.0.124.46', username='siloos', password='admin', timeout=10)
    
    with open('siloos_key.pub', 'r') as f:
        pub_key = f.read().strip()
        
    cmd = f"mkdir -p ~/.ssh && echo '{pub_key}' >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
    print("Executing command to append key...")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    
    out = stdout.read().decode()
    err = stderr.read().decode()
    
    if out:
        print("STDOUT:", out)
    if err:
        print("STDERR:", err)
        
    print("SSH key copied successfully.")
except Exception as e:
    print(f"Error: {e}")
finally:
    ssh.close()
