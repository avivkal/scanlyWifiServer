const express = require("express");
const cp = require("child_process");
const path = require("path");
const fs = require("fs");
const template = require("./template");
const iw = require("iwlist")(config.IFFACE);

const app = express();
const port = 3000;

const PROJECT_NAME = "Carebnb";
const CUSTOM_PROPERTIES_FILE = "/var/carebnb_props.json";

const API_URL = "http://localhost:3500";
const API_PORT = "3500";

const SESSION_KEY = "339Mdea2MxaJj5AZAuJcrpIfqlzzBGFd246E7AEE74F69F1E";

const NODE_ENV = "development";
const ENVIRONMENT = NODE_ENV;
const JWT_KEY =
  "JD8Gzr5h1k3322Zi1632hOG20nOyczHdRCOxYyZ2gmZZNcK7BufFu4InylIzrv";

const IFFACE = "uap0";
const IFFACE_CLIENT = "wlan0";
const SSID = "Carebnb Device";
const IPADDRESS = "192.168.88.1";
const SUBNET_RANGE_START = "192.168.88.100";
const SUBNET_RANGE_END = "192.168.88.200";
const NETMASK = "255.255.255.0";
const FORCE_ACCESSPOINT = "1";
const COUNTRY = "US";

/**
 * Aux method, write access point files from templates
 * Used by disableAccessPoint and enableAccesPoint
 *
 * @param {String} type
 */
const writeAccessPointFiles = (type) => {
  const transpileDhcpcd = template(
    path.join(__dirname, `./templates/dhcpcd/dhcpcd.${type}.hbs`),
    {
      wifi_interface: IFFACE,
      ip_addr: IPADDRESS,
    }
  );
  fs.writeFileSync("/etc/dhcpcd.conf", transpileDhcpcd);

  const transpileDnsmasq = template(
    path.join(__dirname, `./templates/dnsmasq/dnsmasq.${type}.hbs`),
    {
      wifi_interface: IFFACE,
      subnet_range_start: SUBNET_RANGE_START,
      subnet_range_end: SUBNET_RANGE_END,
      netmask: NETMASK,
    }
  );
  fs.writeFileSync("/etc/dnsmasq.conf", transpileDnsmasq);

  const transpileHostapd = template(
    path.join(__dirname, `./templates/hostapd/hostapd.${type}.hbs`),
    {
      ssid: SSID,
      wifi_interface: IFFACE,
    }
  );
  fs.writeFileSync("/etc/hostapd/hostapd.conf", transpileHostapd);
};

const enableAccesPoint = () => {
  writeAccessPointFiles("ap");
  cp.exec(`sudo iw dev ${IFFACE_CLIENT} interface add ${IFFACE} type __ap`);
  cp.exec("sudo systemctl start dhcpcd");
  cp.exec("sudo systemctl enable hostapd");
  cp.exec("sudo systemctl unmask hostapd");
  cp.exec("sudo systemctl start hostapd");
  cp.exec("sudo systemctl start dnsmasq");
};

// const execIgnoreFail = (params) => {
//   try {
//     return cp.execSync(params);
//   } catch (err) {
//     console.error(err);
//   }
//   return null;
// };

// Holds scanned networks SSIDs
let scanned = [];
const _scan = () =>
  new Promise((resolve, reject) => {
    iw.scan((err, result) => {
      if (err) return reject(err);
      console.log("Scanned", JSON.stringify(result));
      if (result.length > 0) {
        scanned = result.map((d) => ({ ssid: d.essid, ...d }));
      }
      resolve(scanned);
    });
  });

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/scan", async (req, res) => {
  const result = await _scan();
  res.send(result);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
  enableAccesPoint();
  console.log("AP is UP!");
});
