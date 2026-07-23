const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withProjectBuildGradle
} = require("expo/config-plugins");
const packageVersion = require("./package.json").version;

const googleServicesFile = "./secrets/google-services.json";
const appIconFile = "./assets/app-icon.png";
const supportedDefaultEnvironments = new Set(["dev", "test", "local-enterprise", "production"]);
const configuredEnvironment = process.env.PATROL360_ENVIRONMENT
  ?? process.env.EXPO_PUBLIC_PATROL360_ENVIRONMENT;
const isReleaseBuild = process.env.NODE_ENV === "production"
  || process.env.EAS_BUILD_PROFILE === "production";
if (isReleaseBuild && !configuredEnvironment) {
  throw new Error("PATROL360_ENVIRONMENT must be explicitly set for a Release build (for example: production or local-enterprise).");
}
const configuredDefaultEnvironment = configuredEnvironment ?? "local-enterprise";
const configuredProductionApiBaseUrl = normalizeConfiguredApiBaseUrl(
  "PATROL360_PRODUCTION_API_URL",
  process.env.PATROL360_PRODUCTION_API_URL
);
const configuredPublicApiBaseUrl = normalizeConfiguredApiBaseUrl(
  "PATROL360_PUBLIC_API_URL",
  process.env.PATROL360_PUBLIC_API_URL
);

if (!supportedDefaultEnvironments.has(configuredDefaultEnvironment)) {
  throw new Error(`Unsupported PATROL360_ENVIRONMENT: ${configuredDefaultEnvironment}`);
}
if (configuredDefaultEnvironment === "production" && !configuredProductionApiBaseUrl) {
  throw new Error("PATROL360_PRODUCTION_API_URL must be set for a production build. The placeholder domain is disabled.");
}

const allowLocalCleartext = configuredDefaultEnvironment === "dev"
  || configuredDefaultEnvironment === "local-enterprise";
const localCleartextHosts = allowLocalCleartext
  ? uniqueValues([
      "192.168.2.194",
      "31.173.110.118",
      "localhost",
      "127.0.0.1",
      configuredPublicApiBaseUrl.startsWith("http://")
        ? new URL(configuredPublicApiBaseUrl).hostname
        : ""
    ])
  : [];

const androidConfig = {
  package: "ru.patrol360.mobile",
  versionCode: 25,
  usesCleartextTraffic: false,
  adaptiveIcon: {
    foregroundImage: appIconFile,
    backgroundColor: "#061A3A"
  },
  permissions: [
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.NFC"
  ],
  blockedPermissions: [
    "android.permission.RECORD_AUDIO",
    "android.permission.SYSTEM_ALERT_WINDOW"
  ]
};

if (fs.existsSync(path.join(__dirname, googleServicesFile))) {
  androidConfig.googleServicesFile = googleServicesFile;
}

function withPilotCleartextTraffic(config) {
  return withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];

    if (application?.$) {
      application.$["android:allowBackup"] = "false";
      application.$["android:fullBackupContent"] = "@xml/backup_rules";
      application.$["android:dataExtractionRules"] = "@xml/data_extraction_rules";
      application.$["android:usesCleartextTraffic"] = "false";
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
      const backupRulesPath = path.join(resourcePath, "backup_rules.xml");
      const dataExtractionRulesPath = path.join(resourcePath, "data_extraction_rules.xml");
      const localCleartextDomains = localCleartextHosts.length > 0
        ? `    <domain-config cleartextTrafficPermitted="true">
${localCleartextHosts.map((host) => `        <domain includeSubdomains="true">${host}</domain>`).join("\n")}
    </domain-config>
`
        : "";
      const securityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
${localCleartextDomains}
</network-security-config>
`;

      await fs.promises.mkdir(resourcePath, { recursive: true });
      await fs.promises.writeFile(configPath, securityConfig, "utf8");
      await fs.promises.writeFile(
        backupRulesPath,
        `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
    <exclude domain="root" path="." />
    <exclude domain="file" path="." />
    <exclude domain="database" path="." />
    <exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
</full-backup-content>
`,
        "utf8"
      );
      await fs.promises.writeFile(
        dataExtractionRulesPath,
        `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup disableIfNoEncryptionCapabilities="true">
        <exclude domain="root" path="." />
        <exclude domain="file" path="." />
        <exclude domain="database" path="." />
        <exclude domain="sharedpref" path="." />
        <exclude domain="external" path="." />
    </cloud-backup>
    <device-transfer>
        <exclude domain="root" path="." />
        <exclude domain="file" path="." />
        <exclude domain="database" path="." />
        <exclude domain="sharedpref" path="." />
        <exclude domain="external" path="." />
    </device-transfer>
</data-extraction-rules>
`,
        "utf8"
      );
      return modConfig;
    }
  ]);
}

function withPatrol360AndroidNetwork(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE",
    "android.permission.POST_NOTIFICATIONS"
  ]);
  config = withPilotNetworkSecurityConfig(config);
  return withPilotCleartextTraffic(config);
}

function withConsistentAndroidNdk(config) {
  return withProjectBuildGradle(config, (modConfig) => {
    const marker = "// patrol360-consistent-ndk";
    if (!modConfig.modResults.contents.includes(marker)) {
      modConfig.modResults.contents += `

${marker}
subprojects {
  plugins.withId("com.android.library") {
    android {
      ndkVersion rootProject.ext.ndkVersion
    }
  }
}
`;
    }

    return modConfig;
  });
}

module.exports = {
  expo: {
    name: "Patrol360",
    slug: "patrol360-mobile",
    scheme: "patrol360",
     version: packageVersion,
    platforms: ["android"],
    orientation: "portrait",
    icon: appIconFile,
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    android: androidConfig,
    plugins: [
      withPatrol360AndroidNetwork,
      withConsistentAndroidNdk,
      "expo-router",
      "expo-notifications",
      "expo-background-task",
      "expo-secure-store",
      [
        "expo-sqlite",
        {
          useSQLCipher: true
        }
      ],
      [
        "expo-camera",
        {
          cameraPermission: "Камера нужна для фото- и видеофиксации обходов, исправностей и неисправностей.",
          recordAudioAndroid: false
        }
      ],
      [
        "expo-image-picker",
        {
          cameraPermission: "Камера нужна для фото- и видеофиксации обходов и замечаний.",
          photosPermission: "Галерея нужна для выбора фото и видео к обходам и замечаниям."
        }
      ]
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      syncProtocolVersion: "1.0",
      defaultEnvironment: configuredDefaultEnvironment,
      productionApiBaseUrl: configuredProductionApiBaseUrl,
      publicApiBaseUrl: configuredPublicApiBaseUrl
    }
  }
};
function normalizeConfiguredApiBaseUrl(name, value) {
  const trimmedValue = value?.trim() ?? "";
  if (!trimmedValue) {
    return "";
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL.`);
  }

  if ((parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
      || !parsedUrl.hostname
      || parsedUrl.username
      || parsedUrl.password
      || (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "")) {
    throw new Error(`${name} must contain only an http(s) origin without credentials or a path.`);
  }

  parsedUrl.pathname = "";
  parsedUrl.search = "";
  parsedUrl.hash = "";
  return parsedUrl.toString().replace(/\/+$/, "");
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}
