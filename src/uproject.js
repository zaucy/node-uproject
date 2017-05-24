// Built-in Modules
const fs = require("fs");
const path = require("path");
const os = require("os");

// Modules
const regedit = require("regedit");

// Constants
const UE4_REGISTRY_PREFIX = "HKCU\\SOFTWARE\\Epic Games\\Unreal Engine";
const UE4_REG_INSTALLS_PREFIX = "HKLM\\SOFTWARE\\EpicGames\\Unreal Engine";

// Class that represents a .uproject
class UProjectConfig {
	constructor(configPath, data) {
		this._data = data;
		this._path = configPath;
	}

	get name() {
		return path.basename(this._path, ".uproject");
	}

	get dirname() {
		return path.dirname(this._path);
	}

	get path() {
		return this._path;
	}

	get engineAssociation() {
		return this._data.EngineAssociation;
	}

	_findEngineDirectoryFromInstall() {
		return new Promise((resolve, reject) => {
			let installsRegisteryPath =
				UE4_REG_INSTALLS_PREFIX + "\\" + this.engineAssociation;

			regedit.arch.list(installsRegisteryPath)
			.on('data', entry => {
				let installDir = entry.data.values.InstalledDirectory.value;

				resolve(installDir);
			}).on('error', err => {
				reject(err);
			});
		});
	}

	_findEngineDirectoryFromSource() {
		return new Promise((resolve, reject) => {

			let buildsRegistryPath = `${UE4_REGISTRY_PREFIX}\\Builds`;

			regedit.arch.list(
				buildsRegistryPath,
				(err, results) => {
					if(err) {
						reject(err);
						return;
					}

					let builds = results[buildsRegistryPath].values;

					if(!builds || !builds[this.engineAssociation]) {
						reject("Couldn't find associated engine.");
						return;
					}

					let engineDirectory = builds[this.engineAssociation].value;

					resolve(engineDirectory);
				}
			);

		});
	}

	getEngineDirectory() {
		return Promise.race([
			this._findEngineDirectoryFromInstall(),
			this._findEngineDirectoryFromSource()
		]).catch(err => {
			reject(`Couldn't find associated engine.`);
		});
	}

	getWin32Targets() {
		let targets = [];

		let configurations = ["Debug", "Development", "Shipping"];

		// @TODO: Support Win32
		let platform = "Win64";

		for(let configuration of configurations) {
			targets.push({
				name: `${this.name}`,
				platform: platform,
				configuration: configuration
			});

			targets.push({
				name: `${this.name}Editor`,
				platform: platform,
				configuration: configuration
			});

			targets.push({
				name: `${this.name}Server`,
				platform: platform,
				configuration: configuration
			});
		}

		return targets;
	}

	getLinuxTargets() {
		throw new Error(
			`uproject - Linux targets not implemented`
		);
	}

	getDarwinTargets() {
		throw new Error(
			`uproject - Darwin targets not implemented`
		);
	}

	getAvailableTargets() {
		// Right now this just gets the targets based on your platform. The
		// available targets could be many more than this based on your environment
		switch(process.platform) {
			case "win32":
				return this.getWin32Targets();
			case "linux":
				return this.getLinuxTargets();
			case "darwin":
				return this.getDarwinTargets();
			default:
				throw new Error(
					`uproject - Unsupported platform '${process.platform}'`
				);
		}
	}


}

function makeUProjectConfig(configPath, src) {
	let data = null;

	try {
		data = JSON.parse(src);
	} catch(err) {
		throw err;
	}

	return new UProjectConfig(configPath, data);
}

exports.findConfigPathSync = function(dir) {
	let entries = fs.readdirSync(dir);

	for(let entry of entries) {
		let extname = path.extname(entry);
		if(extname === ".uproject") {
			return path.resolve(dir, entry);
		}
	}

	return false;
};


exports.findConfigSync = function(dir) {
	let configPath = exports.findConfigPathSync(dir);
	if(!configPath) {
		return false;
	}

	let configSrc = fs.readFileSync(configPath).toString();

	return makeUProjectConfig(configPath, configSrc);
};


exports.findConfigPath = function(dir, cb) {
	fs.readdir(function(err, entries) {

		if(err) {
			cb(err);
			return;
		}

		let configPath = false;

		err = {
			message: `Couldn't find .uproject in '${dir}'`
		};

		for(let entry of entries) {
			let extname = path.extname(entry);
			if(extname === ".uproject") {
				err = null;
				configPath = path.resolve(dir, entry);
				break;
			}
		}

		cb(err, configPath);

	});
};

exports.findConfig = function(dir, cb) {
	exports.findConfigPath((err, configPath) => {
		if(err) {
			cb(err);
			return;
		}

		fs.readFile(configPath, (err, file) => {
			if(err) {
				cb(err);
				return;
			}

			cb(null, makeUProjectConfig(configPath, file.toString()));
		});

	});
};
