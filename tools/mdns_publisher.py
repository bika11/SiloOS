import socket
import time
from zeroconf import IPVersion, ServiceInfo, Zeroconf

def run_mdns():
    ip_addr = socket.inet_aton("127.0.0.1")
    # Also get local Wi-Fi IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        addresses = [socket.inet_aton(local_ip), socket.inet_aton("127.0.0.1")]
    except:
        addresses = [socket.inet_aton("127.0.0.1")]

    desc = {'path': '/'}
    info = ServiceInfo(
        "_http._tcp.local.",
        "SiloOS Dashboard._http._tcp.local.",
        addresses=addresses,
        port=5173,
        properties=desc,
        server="siloos.local.",
    )

    zeroconf = Zeroconf(ip_version=IPVersion.V4Only)
    print("Registering mDNS service for siloos.local:5173...")
    zeroconf.register_service(info)
    print("siloos.local is now broadcasting over mDNS!")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        zeroconf.unregister_service(info)
        zeroconf.close()

if __name__ == "__main__":
    run_mdns()
