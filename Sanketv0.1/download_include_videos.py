#!/usr/bin/env python3
"""
Download specific INCLUDE video archives from Zenodo.
Only downloads the categories we need for hospital reception vocabulary.
"""

import os
import requests
from pathlib import Path
from tqdm import tqdm

# Zenodo record for INCLUDE dataset
ZENODO_RECORD = "4010759"
BASE_URL = f"https://zenodo.org/api/records/{ZENODO_RECORD}"

# Files we need (category + size_MB)
NEEDED_FILES = {
    # Greetings: Hello, Thank you, Good Morning/afternoon/evening/night, Pleased
    "Greetings_1of2.zip": 1500.8,
    "Greetings_2of2.zip": 1152.7,
    # Days_and_Time: Today, Tomorrow, Yesterday, Time, Afternoon
    "Days_and_Time_1of3.zip": 1186.5,
    "Days_and_Time_2of3.zip": 969.7,
    "Days_and_Time_3of3.zip": 813.4,
    # Jobs: Doctor (also Teacher, Lawyer, Nurse, Police, etc.)
    "Jobs_1of2.zip": 1433.5,
    "Jobs_2of2.zip": 1574.2,
    # Home: Telephone
    "Home_1of4.zip": 1190.6,
    "Home_2of4.zip": 1276.5,
    "Home_3of4.zip": 1030.0,
    "Home_4of4.zip": 833.0,
    # Electronics: Cell phone
    "Electronics_1of2.zip": 883.4,
    "Electronics_2of2.zip": 785.9,
}

def get_file_urls():
    """Fetch file metadata from Zenodo API and return {filename: download_url}."""
    print("Fetching file list from Zenodo...")
    r = requests.get(BASE_URL)
    r.raise_for_status()
    data = r.json()
    
    urls = {}
    for f in data["files"]:
        if f["key"] in NEEDED_FILES:
            urls[f["key"]] = f["links"]["self"]
    return urls

def download_file(url: str, dest: Path, expected_mb: float, max_retries: int = 5):
    """Download with resume support + retry (keeps partial, uses Range header)."""
    if dest.exists():
        size_mb = dest.stat().st_size / (1024 * 1024)
        if abs(size_mb - expected_mb) < 5:
            print(f"  [skip] {dest.name} already exists ({size_mb:.1f} MB)")
            return True

    for attempt in range(1, max_retries + 1):
        try:
            existing = dest.stat().st_size if dest.exists() else 0
            headers = {}
            mode = "wb"
            if existing > 1024 * 1024:  # >1MB partial -> resume
                headers["Range"] = f"bytes={existing}-"
                mode = "ab"
                print(f"  [resume] {dest.name} from {existing/(1024*1024):.1f} MB (attempt {attempt}/{max_retries})...")
            else:
                print(f"  [download] {dest.name} ({expected_mb:.1f} MB) - attempt {attempt}/{max_retries}...")
            with requests.get(url, headers=headers, stream=True, timeout=600) as r:
                if r.status_code == 416:  # range not satisfiable -> done
                    print(f"  [done] {dest.name} already complete")
                    return True
                r.raise_for_status()
                # total remaining + existing = full size
                total = int(r.headers.get("content-length", 0)) + (existing if r.status_code == 206 else 0)
                # if 200 but we sent Range and got 200, server ignored Range -> restart
                if r.status_code == 200 and existing > 0:
                    print(f"  [warn] server ignored Range, restarting {dest.name}")
                    existing = 0
                    mode = "wb"
                with open(dest, mode) as f, tqdm(
                    total=total, initial=existing, unit="B", unit_scale=True, unit_divisor=1024,
                    desc=f"    {dest.name}", position=0, leave=True
                ) as pbar:
                    for chunk in r.iter_content(chunk_size=1024*1024):  # 1MB chunks for max throughput
                        if chunk:
                            f.write(chunk)
                            pbar.update(len(chunk))
            actual_mb = dest.stat().st_size / (1024 * 1024)
            if abs(actual_mb - expected_mb) < 50:  # allow 50 MB slack (zip size varies)
                print(f"  [done] {dest.name} ({actual_mb:.1f} MB)")
                return True
            else:
                print(f"  [warn] {dest.name} size {actual_mb:.1f} vs {expected_mb:.1f} MB - will retry if mismatch")
                if abs(actual_mb - expected_mb) < 5:
                    return True
                raise IOError(f"size mismatch {actual_mb:.1f} vs {expected_mb:.1f}")
        except Exception as e:
            print(f"  [error] attempt {attempt} failed: {e}")
            if attempt < max_retries:
                import time
                wait = 2 ** attempt
                print(f"  [retry] waiting {wait}s...")
                time.sleep(wait)
            else:
                print(f"  [failed] {dest.name} after {max_retries} attempts - kept partial {dest.stat().st_size/(1024*1024) if dest.exists() else 0:.1f} MB")
                return False
    return False

def unzip_file(zip_path: Path, extract_to: Path):
    """Unzip a file to the target directory."""
    import zipfile
    print(f"  [unzip] {zip_path.name} -> {extract_to}...")
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_to)
        print(f"  [done] unzipped {zip_path.name}")
        return True
    except Exception as e:
        print(f"  [error] unzip {zip_path.name}: {e}")
        return False

def main():
    out_dir = Path("./INCLUDE_videos")
    out_dir.mkdir(exist_ok=True)
    
    urls = get_file_urls()
    print(f"\nFound {len(urls)} of {len(NEEDED_FILES)} needed files on Zenodo")
    missing = set(NEEDED_FILES) - set(urls)
    if missing:
        print(f"  WARNING: Not found on Zenodo: {missing}")
    
    total_mb = sum(NEEDED_FILES[f] for f in urls)
    print(f"Total to download: {total_mb:.1f} MB ({total_mb/1024:.1f} GB)\n")
    
    # Download with parallelism (4 concurrent) + larger 1MB chunks for max speed
    # Patch chunk size in download_file will be overridden via global
    import concurrent.futures
    success = 0
    # Use 4 workers for max bandwidth (Zenodo allows)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        futs = {}
        for fname, expected_mb in NEEDED_FILES.items():
            if fname not in urls:
                print(f"  [skip] {fname} - not available")
                continue
            dest = out_dir / fname
            # need to capture fname for closure
            fut = ex.submit(download_file, urls[fname], dest, expected_mb)
            futs[fut] = fname
        for fut in concurrent.futures.as_completed(futs):
            fname = futs[fut]
            try:
                ok = fut.result()
                if ok: 
                    success += 1
                    print(f"  [parallel] {fname} done ({success}/{len(futs)})")
                else:
                    print(f"  [parallel] {fname} failed")
            except Exception as e:
                print(f"  [parallel] {fname} exception {e}")
    
    print(f"\nDownloaded {success}/{len(urls)} files")
    
    # Unzip all
    print("\nUnzipping...")
    extract_root = Path("./INCLUDE")
    extract_root.mkdir(exist_ok=True)
    for fname in NEEDED_FILES:
        zip_path = out_dir / fname
        if zip_path.exists():
            unzip_file(zip_path, extract_root)
    
    print("\nAll done! Next step: python fetch_include.py --include-root ./INCLUDE --out ./videos --words generic_words.txt")

if __name__ == "__main__":
    main()