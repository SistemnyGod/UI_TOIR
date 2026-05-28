const fs = require("fs");
const path = require("path");
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const googleServicesFile = "./secrets/google-services.json";

const androidConfig = {
  package: "ru.patrol360.mobile",
  versionCode: 18,
  usesCleartextTraffic: true,
  permissions: [
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE",
    "android.permission.NFC"
  ]
};

if (fs.existsSync(path.join(__dirname, googleServicesFile))) {
  androidConfig.googleServicesFile = googleServicesFile;
}

function withPilotCleartextTraffic(config) {
  return withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];

    if (application?.$) {
      application.$["android:usesCleartextTraffic"] = "true";
      application.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    }

    return modConfig;
  });
}

function withPilotNetworkSecurityConfig(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const resourcePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml"
      );
      const configPath = path.join(resourcePath, "network_security_config.xml");
      const securityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">192.168.2.194</domain>
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
    </domain-config>
</network-security-config>
`;

      await fs.promises.mkdir(resourcePath, { recursive: true });
      await fs.promises.writeFile(configPath, securityConfig, "utf8");
      return modConfig;
    }
  ]);
}

function withPatrol360AndroidNetwork(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE"
  ]);
  config = withPilotNetworkSecurityConfig(config);
  return withPilotCleartextTraffic(config);
}

module.exports = {
  expo: {
    name: "Patrol360",
    slug: "patrol360-mobile",
    scheme: "patrol360",
    version: "0.1.17",
    platforms: ["android"],
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    android: androidConfig,
    plugins: [
      withPatrol360AndroidNetwork,
      "expo-router",
      "expo-secure-store",
      "expo-sqlite",
      [
        "expo-camera",
        {
          cameraPermission: "Камера нужна для фотофиксации исправностей и неисправностей.",
          recordAudioAndroid: false
        }
      ],
      [
        "expo-image-picker",
        {
          cameraPermission: "Камера нужна для фотофиксации обходов и замечаний.",
          photosPermission: "Галерея нужна для выбора фото к обходам и замечаниям."
        }
      ]
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      syncProtocolVersion: "1.0",
      defaultEnvironment: "dev"
    }
  }
};
