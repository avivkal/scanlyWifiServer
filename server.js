const express = require("express");
const cp = require("child_process");
const path = require("path");
const fs = require("fs");
const template = require("./template");
const iw = require("iwlist")("uap0");

const app = express();

const API_URL = "http://localhost:3000";
const API_PORT = 3000;

const IFFACE = "uap0";
const IFFACE_CLIENT = "wlan0";
const SSID = "Scanly Device";
const IPADDRESS = "192.168.88.1";
const SUBNET_RANGE_START = "192.168.88.100";
const SUBNET_RANGE_END = "192.168.88.200";
const NETMASK = "255.255.255.0";
const COUNTRY = "IL";

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

// Eecute ssh commands without taking any caution
// Inputs and results are unexpected
const execIgnoreFail = (params) => {
  try {
    return cp.execSync(params);
  } catch (err) {
    console.error(err);
  }
  return null;
};

/**
 * Check if it is connected to a wifi network
 *
 * @returns {boolean}
 */
const checkIfIsConnected = () => {
  const exec = String(
    execIgnoreFail(`iw ${IFFACE_CLIENT} link`) || "Not connected"
  );
  return exec.includes("Not connected") === false;
};

const disableAccessPoint = () => {
  console.log("Disabling access point");
  cp.exec("sudo systemctl stop dnsmasq");
  cp.exec("sudo systemctl stop hostapd");
  cp.exec("sudo systemctl disable hostapd");
  cp.exec(`sudo iw dev ${IFFACE} del`);
  cp.exec(`sudo systemctl restart dhcpd`);
};

/**
 * Try to connect on a wifi network
 *
 * @param {String} ssid
 * @param {String} password
 * @param {String} countryCode
 */
const connect = (ssid, password, countryCode = COUNTRY) => {
  // Write a wpa_suppplicant.conf file and save it
  const fileContent = template(
    path.join(__dirname, `./templates/wpa_supplicant.hbs`),
    {
      country: countryCode,
      ssid: ssid,
      psk: password,
    }
  );
  fs.writeFileSync("/etc/wpa_supplicant/wpa_supplicant.conf", fileContent);

  cp.exec("sudo killall wpa_supplicant");
  cp.exec(
    `sudo wpa_supplicant -B -i${IFFACE_CLIENT} -c /etc/wpa_supplicant/wpa_supplicant.conf`
  );

  cp.exec(`sudo wpa_cli -i${IFFACE_CLIENT} RECONFIGURE`);
  cp.exec(`sudo ifconfig ${IFFACE_CLIENT} up`);
  cp.exec("sudo systemctl daemon-reload");
  cp.exec("sudo systemctl restart dhcpcd");

  if (!checkIfIsConnected()) {
    console.log("failed to connect");
  } else {
    disableAccessPoint();
    console.log("connected");
  }

  // cp.exec(`sudo reboot`);
};

// Holds scanned networks SSIDs
let scanned = [];
const _scan = () =>
  new Promise((resolve, reject) => {
    iw.scan((err, result) => {
      if (err) {
        console.error(err);
        return reject(err);
      }
      console.log("Scanned", JSON.stringify(result));
      if (result.length > 0) {
        scanned = result.map((d) => ({ ssid: d.essid, ...d }));
      }
      resolve(scanned);
    });
  });

app.get("/isAlive", (_req, res) => {
  res.send(true);
});

app.get("/scan", async (_req, res) => {
  const result = await _scan();
  res.send(result);
});

app.post("/connect", async (req, res) => {
  connect(req.body.ssid, req.body.password);
  cp.exec(`touch cred.txt`);
  cp.exec(`echo "${req.body.cred}" > cred.txt`);
  res.send("Connected??");
});

app.get("/test", async (req, res) => {
  connect(req.query.ssid, req.query.password);
  cp.exec(`touch cred.txt`);
  cp.exec(`echo "${req.query.cred}" > cred.txt`); // ? was never tested
  res.send("Connected??");
});

app.listen(API_PORT, () => {
  console.log(`Example app listening on port ${API_PORT}`);
  if (checkIfIsConnected()) {
    disableAccessPoint();
  } else {
    enableAccesPoint();
    console.log("AP is UP!");
  }
});
