"""Build UNCsWay Final: the same app as UNCsWay, opening the dashboard (public/final.html) in a window whose title
bar belongs to the page. Apple Silicon only: an arm64 binary built with whole-module optimisation, marked native
so it never runs under Rosetta.

  python3 scripts/build-final-macos.py [--install]
"""
import argparse
import datetime
import pathlib
import plistlib
import shutil
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('--install', action='store_true', help='Install in ~/Applications, keeping the previous bundle as a backup')
args = parser.parse_args()

NAME, EXECUTABLE, IDENTIFIER = 'UNCsWay Final', 'UNCsWayFinal', 'local.uncsway.final'


def sign_bundle(path):
    # Finder/iCloud metadata is not allowed in a signed app: strip only those two attributes, and retry when iCloud
    # reattaches FinderInfo between signing and verification (other signing errors are not hidden).
    for attempt in range(3):
        for item in [*path.rglob('*'), path]:
            attributes = subprocess.run(['/usr/bin/xattr', str(item)], check=True, capture_output=True, text=True).stdout.splitlines()
            for attribute in ('com.apple.FinderInfo', 'com.apple.ResourceFork'):
                if attribute in attributes:
                    subprocess.run(['/usr/bin/xattr', '-d', attribute, str(item)], check=True)
        for command in [['codesign', '--force', '--sign', '-', str(path)], ['codesign', '--verify', '--deep', '--strict', str(path)]]:
            result = subprocess.run(command, capture_output=True, text=True)
            if result.returncode:
                if attempt < 2 and 'resource fork, Finder information' in result.stderr:
                    break
                print(result.stderr)
                result.check_returncode()
        else:
            return


root = pathlib.Path(__file__).resolve().parents[1]
output = root / 'dist' / f'{NAME}.app'
with tempfile.TemporaryDirectory(prefix='qs-final-') as work:
    app = pathlib.Path(work) / f'{NAME}.app'
    contents = app / 'Contents'
    executable = contents / 'MacOS' / EXECUTABLE
    resources = contents / 'Resources'
    executable.parent.mkdir(parents=True)
    resources.mkdir()
    shutil.copytree(root / 'public', resources / 'public', copy_function=shutil.copyfile)
    shutil.copyfile(root / 'app/api/events/snapshot.json', resources / 'snapshot.json')
    shutil.copyfile(root / 'desktop/macos/AppIcon.icns', resources / 'AppIcon.icns')
    subprocess.run(['xcrun', 'swiftc', '-O', '-wmo', '-target', 'arm64-apple-macosx12.0', '-Xlinker', '-dead_strip',
                    str(root / 'desktop/macos/main.swift'), '-o', str(executable)], check=True)
    info = {
        'CFBundleExecutable': EXECUTABLE, 'CFBundleIdentifier': IDENTIFIER,
        'CFBundleName': NAME, 'CFBundleDisplayName': 'UNC’s Way Final',
        'CFBundlePackageType': 'APPL', 'CFBundleShortVersionString': '1.0.0', 'CFBundleVersion': '1',
        'CFBundleIconFile': 'AppIcon', 'LSMinimumSystemVersion': '12.0',
        'NSHighResolutionCapable': True, 'NSPrincipalClass': 'NSApplication',
        'LSApplicationCategoryType': 'public.app-category.finance',
        # Apple Silicon: native arm64, never translated.
        'LSArchitecturePriority': ['arm64'], 'LSRequiresNativeExecution': True,
        'UNCShell': 'final',
    }
    with (contents / 'Info.plist').open('wb') as handle:
        plistlib.dump(info, handle)
    sign_bundle(app)
    output.parent.mkdir(exist_ok=True)
    if output.exists():
        with (output / 'Contents/Info.plist').open('rb') as handle:
            assert plistlib.load(handle)['CFBundleIdentifier'] == IDENTIFIER
        shutil.rmtree(output)
    shutil.copytree(app, output, copy_function=shutil.copyfile)
    (output / 'Contents/MacOS' / EXECUTABLE).chmod(0o755)
    sign_bundle(output)
    if args.install:
        applications = pathlib.Path.home() / 'Applications'
        applications.mkdir(exist_ok=True)
        destination = applications / f'{NAME}.app'
        with tempfile.TemporaryDirectory(prefix='.uncsway-final-install-', dir=applications) as staging:
            staged = pathlib.Path(staging) / f'{NAME}.app'
            shutil.copytree(app, staged, copy_function=shutil.copyfile)
            (staged / 'Contents/MacOS' / EXECUTABLE).chmod(0o755)
            sign_bundle(staged)
            backup = None
            if destination.exists():
                with (destination / 'Contents/Info.plist').open('rb') as handle:
                    if plistlib.load(handle).get('CFBundleIdentifier') != IDENTIFIER:
                        raise RuntimeError('Destination belongs to a different application')
                backup = applications / f".UNCsWayFinal-backup-{datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')}.app"
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
