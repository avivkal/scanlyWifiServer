const express = require("express");
const cp = require("child_process");

const app = express();
const port = 3000;

/**
 * Aux method, write access point files from templates
 * Used by disableAccessPoint and enableAccesPoint
 *
 * @param {String} type
 */
const writeAccessPointFiles = (type) => {
  const transpileDhcpcd = template(
    path.join(__dirname, `../../templates/dhcpcd/dhcpcd.${type}.hbs`),
    {
      wifi_interface: config.IFFACE,
      ip_addr: config.IPADDRESS,
    }
  );
  fs.writeFileSync("/etc/dhcpcd.conf", transpileDhcpcd);

  const transpileDnsmasq = template(
    path.join(__dirname, `../../templates/dnsmasq/dnsmasq.${type}.hbs`),
    {
      wifi_interface: config.IFFACE,
      subnet_range_start: config.SUBNET_RANGE_START,
      subnet_range_end: config.SUBNET_RANGE_END,
      netmask: config.NETMASK,
    }
  );
  fs.writeFileSync("/etc/dnsmasq.conf", transpileDnsmasq);

  const transpileHostapd = template(
    path.join(__dirname, `../../templates/hostapd/hostapd.${type}.hbs`),
    {
      ssid: config.SSID,
      wifi_interface: config.IFFACE,
    }
  );
  fs.writeFileSync("/etc/hostapd/hostapd.conf", transpileHostapd);
};

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
  writeAccessPointFiles("ap");
  cp.exec(
    "sudo iw dev ${config.IFFACE_CLIENT} interface add ${config.IFFACE} type __ap"
  );
  cp.exec("sudo systemctl start dhcpcd");
  cp.exec("sudo systemctl enable hostapd");
  cp.exec("sudo systemctl unmask hostapd");
  cp.exec("sudo systemctl start hostapd");
  cp.exec("sudo systemctl start dnsmasq");
  console.log("AP is UP!");
});
