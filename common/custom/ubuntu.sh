#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) ImmortalWrt.org

function install_mustrelyon(){
# 安装依赖
sudo mount -o remount,rw /
fsck -f /
sudo dpkg --configure -a
sudo apt-get install -f
sudo bash -c 'bash <(curl -s https://build-scripts.immortalwrt.eu.org/init_build_environment.sh)'
# libpcre3/libpcre3-dev 在 22.04 与 24.04 均存在(libpcre/libpcre-dev 为旧名,24.04已无)
sudo apt-get install -y rename pigz libfuse-dev upx subversion clang libpcre3 libpcre3-dev || true
# lean 依赖短链(is.gd)已失效且curl -f静默返回空,保留尝试但不阻断;ImmortalWrt官方脚本已装核心依赖
sudo apt-get install -y $(curl -fsSL https://is.gd/depend_ubuntu2404_openwrt) $(curl -fsSL https://is.gd/depend_ubuntu2204_openwrt) || echo "lean依赖短链不可用,跳过(核心依赖已由ImmortalWrt脚本安装)"
}

function update_apt_source(){
node --version
yarn --version
sudo apt-get autoremove -y --purge
sudo apt-get clean
}

function Delete_po2lmo(){
sudo rm -rf po2lmo
}

function main(){
	if [[ -n "${BENDI_VERSION}" ]]; then
		BENDI_VERSION="1"
		INS="sudo apt-get"
		echo "开始升级ubuntu插件和安装依赖....."
		install_mustrelyon
		update_apt_source
		Delete_po2lmo
	else
		INS="sudo -E apt-get -qq"
		install_mustrelyon
		Delete_useless
		update_apt_source
	fi
}

main
