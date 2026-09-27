#!/usr/bin/env python3
"""Build, verify and optionally install the independent ARM64 Swift app."""
import argparse
import datetime
import pathlib
import plistlib
import shutil
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--install', action='store_true')
args = parser.parse_args()
package = root / 'desktop/native'
def run(*command):
    subprocess.run(command, cwd=root, check=True)
run('swift', 'build', '--package-path', str(package), '-c', 'release', '--arch', 'arm64')
bin_dir = pathlib.Path(subprocess.check_output(['swift', 'build', '--package-path', str(package), '-c', 'release', '--arch', 'arm64', '--show-bin-path'], text=True).strip())
binary = bin_dir / 'UNCsWayNative'
run(str(binary), '--self-test')
staging = tempfile.TemporaryDirectory(prefix='uncsway-native-')
app = pathlib.Path(staging.name) / 'UNCsWay Native.app'
contents = app / 'Contents'
(contents / 'MacOS').mkdir(parents=True, exist_ok=True)
(contents / 'Resources').mkdir(exist_ok=True)
shutil.copyfile(binary, contents / 'MacOS/UNCsWayNative')
(contents / 'MacOS/UNCsWayNative').chmod(0o755)
shutil.copyfile(root / 'desktop/macos/AppIcon.icns', contents / 'Resources/AppIcon.icns')
info = dict(CFBundleName='UNCsWay Native', CFBundleDisplayName='UNCsWay Native', CFBundleIdentifier='local.uncsway.native', CFBundleExecutable='UNCsWayNative', CFBundlePackageType='APPL', CFBundleShortVersionString='0.1.0', CFBundleVersion='1', CFBundleIconFile='AppIcon', LSMinimumSystemVersion='14.0', NSHighResolutionCapable=True, NSSupportsAutomaticGraphicsSwitching=True)
with (contents / 'Info.plist').open('wb') as file:
    plistlib.dump(info, file)
# Sign outside cloud-synced Documents to avoid File Provider Finder metadata.
run('codesign', '--force', '--deep', '--sign', '-', str(app))
run('codesign', '--verify', '--deep', '--strict', str(app))
if args.install:
    destination = pathlib.Path.home() / 'Applications/UNCsWay Native.app'
    if destination.exists():
        backup = destination.with_name('UNCsWay Native.backup-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.app')
        destination.rename(backup)
    shutil.copytree(app, destination)
    run('codesign', '--verify', '--deep', '--strict', str(destination))
    print('Installed:', destination)
distribution = root / 'dist/UNCsWay Native.app'
shutil.copytree(app, distribution, dirs_exist_ok=True)
print('Built:', distribution)
staging.cleanup()
