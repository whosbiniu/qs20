"""Build a self-contained macOS app using Apple's installed command-line tools."""
import pathlib
import plistlib
import shutil
import subprocess
import tempfile
import argparse
import datetime

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--install', action='store_true', help='Install in ~/Applications, keeping the previous bundle as a backup')
args = parser.parse_args()

def sign_bundle(path):
    # Finder/iCloud metadata is not allowed in a signed app. Strip only those
    # two metadata attributes from our generated bundle, not security attributes.
    # iCloud can reattach FinderInfo between signing and verification; retry
    # this specific metadata failure, without hiding other signing errors.
    for attempt in range(3):
        # Clean the bundle root last: Finder marks .app directories eagerly.
        for item in [*path.rglob('*'), path]:
            attributes = subprocess.run(['/usr/bin/xattr', str(item)], check=True,
                                        capture_output=True, text=True).stdout.splitlines()
            for attribute in ('com.apple.FinderInfo', 'com.apple.ResourceFork'):
                if attribute in attributes:
                    subprocess.run(['/usr/bin/xattr', '-d', attribute, str(item)], check=True)
        for command in [['codesign', '--force', '--sign', '-', str(path)],
                        ['codesign', '--verify', '--deep', '--strict', str(path)]]:
            result = subprocess.run(command, capture_output=True, text=True)
            if result.returncode:
                if attempt < 2 and 'resource fork, Finder information' in result.stderr:
                    break
                print(result.stderr)
                result.check_returncode()
        else:
            return

root = pathlib.Path(__file__).resolve().parents[1]
output = root / "dist" / "UNCsWay.app"
with tempfile.TemporaryDirectory(prefix="qs-macos-") as work:
    app = pathlib.Path(work) / "UNCsWay.app"
    contents = app / "Contents"
    executable = contents / "MacOS" / "UNCsWay"
    resources = contents / "Resources"
    executable.parent.mkdir(parents=True)
    resources.mkdir()
    shutil.copytree(root / "public", resources / "public", copy_function=shutil.copyfile)
    shutil.copyfile(root / "app/api/events/snapshot.json", resources / "snapshot.json")
    subprocess.run(["xcrun", "swiftc", "-O", "-target", "arm64-apple-macosx12.0",
                    str(root / "desktop/macos/main.swift"), "-o", str(executable)], check=True)
    info = {
        "CFBundleExecutable": "UNCsWay", "CFBundleIdentifier": "local.uncsway.quarterly",
        "CFBundleName": "UNCsWay", "CFBundleDisplayName": "UNC’sWay",
        "CFBundlePackageType": "APPL", "CFBundleShortVersionString": "1.7.1",
        "CFBundleVersion": "10", "LSMinimumSystemVersion": "12.0",
        "NSHighResolutionCapable": True, "NSPrincipalClass": "NSApplication",
    }
    with (contents / "Info.plist").open("wb") as handle:
        plistlib.dump(info, handle)
    sign_bundle(app)
    output.parent.mkdir(exist_ok=True)
    if output.exists():
        # Replace only the generated bundle owned by this build script.
        with (output / "Contents/Info.plist").open("rb") as handle:
            assert plistlib.load(handle)["CFBundleIdentifier"] == info["CFBundleIdentifier"]
        shutil.rmtree(output)
    shutil.copytree(app, output, copy_function=shutil.copyfile)
    # copyfile does not retain executable mode.
    (output / 'Contents/MacOS/UNCsWay').chmod(0o755)
    sign_bundle(output)
    if args.install:
        applications = pathlib.Path.home() / 'Applications'
        applications.mkdir(exist_ok=True)
        destination = applications / 'UNCsWay.app'
        with tempfile.TemporaryDirectory(prefix='.uncsway-install-', dir=applications) as staging:
            staged = pathlib.Path(staging) / 'UNCsWay.app'
            shutil.copytree(app, staged, copy_function=shutil.copyfile)
            (staged / 'Contents/MacOS/UNCsWay').chmod(0o755)
            sign_bundle(staged)
            backup = None
            if destination.exists():
                with (destination / 'Contents/Info.plist').open('rb') as handle:
                    if plistlib.load(handle).get('CFBundleIdentifier') != info['CFBundleIdentifier']:
                        raise RuntimeError('Destination belongs to a different application')
                suffix = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
                backup = applications / f'.UNCsWay-backup-{suffix}.app'
                destination.rename(backup)
            try:
                staged.rename(destination)
            except OSError:
                if backup is not None:
                    backup.rename(destination)
                raise
            print('Installed:', destination)
            if backup is not None:
                print('Previous version:', backup)
print(output)
