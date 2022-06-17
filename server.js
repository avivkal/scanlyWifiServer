const express = require("express");
const cp = require("child_process");
const path = require("path");
const fs = require("fs");
const template = require("./template");
const { waitForDebugger } = require("inspector");
const iw = require("iwlist")("uap0");

const app = express();

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

const errorCallaback = (error) => console.log(error);

const sleep = (time) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, time);
  });
};

/**
 * Try to connect on a wifi network
 *
 * @param {String} ssid
 * @param {String} password
 * @param {String} countryCode
 */
const connect = async (ssid, password, cred, countryCode = COUNTRY) => {
  // Write a wpa_suppplicant.conf file and save it
  const fileContent = template(
    path.join(__dirname, `./templates/wpa_supplicant.hbs`),
    {
      country: countryCode,
      ssid: ssid,
      psk: password,
      key_mgmt: "WPA-PSK",
    }
  );
  fs.writeFileSync("/etc/wpa_supplicant/wpa_supplicant.conf", fileContent);
  fs.writeFileSync(
    "/etc/network/interfaces",
    `iface wlan0 inet static
    address ${IPADDRESS}
    netmask ${NETMASK}
    pre-up wpa_supplicant -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant.conf -B
  `
  );

  console.log("Starting connection");
  await sleep(500);
  execIgnoreFail("sudo killall wpa_supplicant");
  await sleep(500);
  execIgnoreFail(
    `sudo wpa_supplicant -B -i ${IFFACE_CLIENT} -c /etc/wpa_supplicant/wpa_supplicant.conf`
  );

  await sleep(500);

  execIgnoreFail(`sudo wpa_cli -i ${IFFACE_CLIENT} RECONFIGURE`);
  await sleep(500);
  execIgnoreFail(`sudo ifdown ${IFFACE_CLIENT}`);
  await sleep(500);
  execIgnoreFail(`sudo ifup ${IFFACE_CLIENT}`);
  await sleep(500);
  execIgnoreFail(`sudo /etc/init.d/networking restart`);
  await sleep(15000);

  console.log("Checking connection");
  try {
    cp.execSync("ping -c 1 google.com");
    console.log("Ping successful");
    execIgnoreFail(`touch ../cred.txt`);
    execIgnoreFail(`echo "${cred}" > ../cred.txt`);
    console.log("Write cred successful");
    return true;
  } catch {
    console.log("failed to connect");
    return false;
  }
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
  const responseConnection = await connect(
    req.body.ssid,
    req.body.password,
    req.body.cred
  );

  console.log(responseConnection);
  res.send(responseConnection);

  if (responseConnection) {
    disableAccessPoint();
  }
});

app.get("/test", async (req, res) => {
  const responseConnection = await connect(
    req.query.ssid,
    req.query.password,
    req.query.cred
  );

  console.log(responseConnection);
  res.send(responseConnection);

  await sleep(30000);

  if (responseConnection) {
    disableAccessPoint();
  }
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
