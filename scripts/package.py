"""Produce one uploadable CloudFormation template, without SAM or extra packages."""
import json
import base64
import io
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def package():
    template = json.loads((ROOT / 'infra' / 'classroom.json').read_text(encoding='utf-8'))
    source = 'import sys, types\n'
    # Inline modules are created in dependency order. Local demo/auth code is excluded.
    for name in ('domain', 'store', 'service', 'files'):
        code = (ROOT / 'backend' / (name + '.py')).read_text(encoding='utf-8')
        source += f"m = types.ModuleType({name!r}); sys.modules[{name!r}] = m\nexec(compile({code!r}, {name + '.py'!r}, 'exec'), m.__dict__)\n"
    source += (ROOT / 'backend' / 'handler.py').read_text(encoding='utf-8')
    compile(source, 'index.py', 'exec')
    template['Resources']['ApiFunction']['Properties']['Code']['ZipFile'] = source
    asset_source = (ROOT / 'backend/deploy_assets.py').read_text(encoding='utf-8')
    compile(asset_source, 'index.py', 'exec')
    template['Resources']['AssetFunction']['Properties']['Code']['ZipFile'] = asset_source
    trigger_source = (ROOT / 'backend/cognito_trigger.py').read_text(encoding='utf-8')
    compile(trigger_source, 'index.py', 'exec')
    template['Resources']['CognitoTriggerFunction']['Properties']['Code']['ZipFile'] = trigger_source
    frontend = ROOT / 'frontend/dist'
    if not (frontend / 'index.html').exists():
        raise SystemExit('Run npm run build in frontend before packaging the CloudFormation template.')
    bundle = io.BytesIO()
    with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for asset in sorted(frontend.rglob('*')):
            if asset.is_file():
                archive.write(asset, asset.relative_to(frontend).as_posix())
    template['Resources']['SiteAssets']['Properties']['Bundle'] = base64.b64encode(bundle.getvalue()).decode('ascii')
    output = ROOT / 'build'
    output.mkdir(exist_ok=True)
    path = output / 'classroom-stack.json'
    text = json.dumps(template, ensure_ascii=False, separators=(',', ':'))
    if len(text.encode()) > 1000000:
        raise SystemExit('Combined template exceeds 1 MB. Use S3 template/asset packaging before deploying.')
    path.write_text(text, encoding='utf-8')
    with zipfile.ZipFile(output / 'classroom-backend.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in ('domain', 'store', 'service', 'files', 'handler', 'cognito_trigger'):
            archive.write(ROOT / 'backend' / (name + '.py'), name + '.py')
    print(f'CloudFormation template: {path} ({len(text.encode()):,} bytes)')
    return path


if __name__ == '__main__': package()
