const { execFileSync } = require("node:child_process");
const path = require("node:path");

/**
 * Ad-hoc sign the packaged macOS app.
 *
 * Electron's binary arrives with a "linker-signed" ad-hoc signature covering
 * its own contents. Packaging invalidates it: app.asar is inserted, Info.plist
 * is rewritten and the executable is renamed, after which `codesign --verify`
 * reports "code has no resources but signature indicates they must be present".
 * macOS refuses to launch an arm64 bundle whose signature does not verify, so
 * an unsigned build fails on Apple Silicon with "the application is damaged".
 *
 * electron-builder only signs with a keychain identity, and its `identity`
 * option is matched against certificate *names* - setting it to "-" yields
 * "no valid identity with this name" rather than an ad-hoc signature - so the
 * re-sign has to happen here, before the dmg and zip are built from the app.
 *
 * This is not a substitute for a Developer ID signature. The app stays
 * unnotarised, so first launch still needs right-click -> Open. When a real
 * certificate is available electron-builder signs with it, that signature
 * verifies, and this hook leaves it alone.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  // A signature that already verifies is a real one from electron-builder;
  // replacing it with an ad-hoc signature would be a downgrade.
  try {
    execFileSync("codesign", ["--verify", "--strict", appPath], {
      stdio: "ignore",
    });
    return;
  } catch {
    // Falls through to signing below.
  }

  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  });
  console.log(`  • ad-hoc signed  file=${path.relative(context.packager.projectDir, appPath)}`);
};
