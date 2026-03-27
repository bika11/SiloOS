# Remote Access Guide for SiloOS

Accessing your Raspberry Pi "Brain" from outside your local network (e.g., from home) is essential for monitoring and control. Below are the two main ways to achieve this, with **Tailscale** being the highly recommended method for security and ease of use.

## 1. Tailscale (Recommended)

Tailscale is a "zero-config" VPN that creates a secure, private network between your devices, no matter where they are. It's perfect for non-coders because it doesn't require complex router settings.

### Why use it?
- **Secure**: All traffic is encrypted end-to-end.
- **Easy**: Just install an app on your Pi and your laptop/phone.
- **Reliable**: Works even if your workplace has strict firewalls.
- **Persistent**: The service is enabled to start automatically on reboot.

### How to set it up:
1.  **Create an account**: Go to [tailscale.com](https://tailscale.com) and sign up for a free account.
2.  **Install on the Pi**: 
    - Login to your Pi via SSH (as you normally do).
    - Run this command: `curl -fsSL https://tailscale.com/install.sh | sh`
    - After installation, run: `sudo tailscale up`
    - Follow the link provided in the terminal to authenticate your Pi.
3.  **Install on your home device**: Download and install Tailscale on your home laptop, tablet, or phone.
4.  **Connect**: 
    - Once logged in on both, your Pi will have a new **Tailscale IP address** (e.g., `100.x.y.z`).
    - Use this IP address instead of the local one (`10.0.124.199`) to access your dashboard and SSH from anywhere in the world.

---

## 2. Port Forwarding (NOT Recommended)

This is the traditional method but is **NOT recommended** for Industrial SiloOS due to security risks.

### Why avoid it?
- **Unsafe**: It opens your Pi directly to the public internet, making it a target for hackers.
- **Complex**: Requires changing settings in your workplace's router or firewall.
- **Dynamic IPs**: If your workplace internet IP changes, your connection will break.

### If you must:
1.  Log into your router's admin panel.
2.  Forward port `8765` (WebSocket) and port `5173` (Dashboard) to the Pi's local IP (`10.0.124.199`).
3.  Use your workplace's **Public IP** to connect.

---

## 3. Accessing the Dashboard

Once you have Tailscale running:

- **Local (At the Silo)**: `http://10.0.124.199:5173`
- **Remote (At Home)**: `http://[Your-Tailscale-IP]:5173`

> [!TIP]
> Always use Tailscale if you want a "plug and play" experience without worrying about security or network configurations.
