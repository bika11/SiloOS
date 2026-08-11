# Remote Access Guide for SiloOS

Accessing your Raspberry Pi "Brain" from outside your local network (e.g., from home) is essential for monitoring and control. Below are the two main ways to achieve this, with **Tailscale** being the highly recommended method for security and ease of use.

## 1. Dashboard Addresses

Prefer the **mDNS hostname `siloos.local`** — it works regardless of the Pi's IP. The Pi is *intended* to hold static IP `10.0.124.5`, but its DHCP address has drifted repeatedly in the past (`.199` → `.90` → `.125`), so never bookmark a raw IP for day-to-day use.

| Address | Works from | Notes |
|---------|-----------|-------|
| `http://siloos.local:5173/` | Same Wi-Fi network | **Preferred** — auto-discovery by hostname, survives IP changes |
| `http://10.0.124.5:5173/` | Same Wi-Fi network | Only after the static IP is applied (`tools/set_pi_static_ip.sh`) |
| `http://100.120.122.115:5173/` | Anywhere (with Tailscale) | Tailscale VPN address |

> [!TIP]
> **Bookmark `http://siloos.local:5173/`** for local access and **`http://100.120.122.115:5173/`** for remote access.

> [!WARNING]
> If `siloos.local` resolves to the wrong device (e.g. your own laptop), a rogue `tools/mdns_publisher.py` mock may be running locally. See the `siloos-pi-recovery` skill.

### Target static network config
| Setting | Value |
|---------|-------|
| IP address | `10.0.124.5` |
| Subnet mask | `255.255.255.0` (/24) |
| Gateway | `10.0.124.1` |

Apply on the Pi with `bash tools/set_pi_static_ip.sh` (handles both NetworkManager and dhcpcd).

---

## 2. Tailscale (Recommended for Remote Access)

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
    - Once logged in on both, your Pi will have a Tailscale IP: **`100.120.122.115`**
    - Use this IP address instead of the local one to access your dashboard and SSH from anywhere in the world.

---

## 3. Port Forwarding (NOT Recommended)

This is the traditional method but is **NOT recommended** for Industrial SiloOS due to security risks.

### Why avoid it?
- **Unsafe**: It opens your Pi directly to the public internet, making it a target for hackers.
- **Complex**: Requires changing settings in your workplace's router or firewall.
- **Dynamic IPs**: If your workplace internet IP changes, your connection will break.

### If you must:
1.  Log into your router's admin panel.
2.  Forward port `8765` (WebSocket) and port `5173` (Dashboard) to the Pi's local IP (`siloos.local`).
3.  Use your workplace's **Public IP** to connect.

---

## 4. SSH Access

For terminal access to the Pi:

```bash
# Local network
ssh -i siloos_key siloos@siloos.local

# Remote (via Tailscale)
ssh -i siloos_key siloos@100.120.122.115
```

> [!TIP]
> Always use Tailscale if you want a "plug and play" experience without worrying about security or network configurations.
