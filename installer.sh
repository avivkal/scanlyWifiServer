#! /bin/bash

# Update apt get
sudo apt-get -y update
sudo apt --fix-broken -y install
sudo apt-get -y upgrade

sudo apt-get --purge remove -y node
sudo apt-get --purge remove -y nodejs

sudo apt-get install -y nodejs
sudo apt-get install -y git
sudo apt-get install -y build-essential
sudo apt-get install -y libudev-dev
sudo apt-get install -y hostapd
sudo apt-get install -y dnsmasq
sudo apt-get install -y iw
sudo apt-get install -y npm

# Activate rf interfaces
sudo rfkill unblock wifi
sudo rfkill unblock all

# Setup project
npm install