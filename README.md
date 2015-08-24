# Torrent Pi
Raspberry PI - Stream from torrents easily with a web remote.

Based on [nilakshdas/flixtor](https://github.com/nilakshdas/flixtor)

### Install from Scratch

It is recommended that you use a large SD card, 8 GB should be enough.

- [Download Raspbian](https://www.raspberrypi.org/downloads/raspbian/)

- [Format then Write the Raspbian Image to your SD Card](https://www.raspberrypi.org/documentation/installation/installing-images/README.md)

- On first boot, please make sure to **Expand Filesystem** ([click here](https://www.raspberrypi.org/documentation/configuration/raspi-config.md) if you missed doing it on first boot)

- Login to your Pi for the first time (user: **pi** / pass: **raspberry**)

### Prerequisites

    sudo apt-get update
    sudo apt-get upgrade
    wget http://node-arm.herokuapp.com/node_latest_armhf.deb
    sudo dpkg -i node_latest_armhf.deb

### Install Torrent Pi

    git clone --recursive https://github.com/jaruba/torrent-pi.git
    cd torrent-pi
    sudo npm install

*installing might take longer then you expect*

### Setup auto-login for your RPi

    sudo nano /etc/inittab

change this line:

    1:2345:respawn:/sbin/getty 115200 tty1

to this line:

    1:2345:respawn:/bin/login -f pi tty1 </dev/tty1> /dev/tty1 2>&1

### Setup Torrent Pi to run on start-up

Note: Torrent Pi does not require the Desktop GUI, this guide explains how to run it from the main terminal directly.

    sudo nano /etc/profile

add this line to the end of the file:

    . /home/pi/torrentPi.sh

now do:

    sudo nano /home/pi/torrentPi.sh

and write:

    sudo node /home/pi/torrent-pi/app.js

If you did not install ``torrent-pi`` in the default directory of your pi, make sure to change the path to the ``app.js`` file from your install path.
