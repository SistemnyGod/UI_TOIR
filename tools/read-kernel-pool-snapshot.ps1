# Read-only diagnostic. No tracing, driver loading, pool resets or configuration changes.
# ABI reference: phnt/include/ntexapi.h, SYSTEM_POOLTAG_INFORMATION (System Informer).
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class PatrolAuditPoolSnapshot {
    [StructLayout(LayoutKind.Sequential)]
    private struct PoolTag {
        public uint Tag, PagedAllocs, PagedFrees;
        public UIntPtr PagedUsed;
        public uint NonPagedAllocs, NonPagedFrees;
        public UIntPtr NonPagedUsed;
    }
    public sealed class Row {
        public string Tag { get; set; }
        public ulong PagedBytes { get; set; }
        public ulong NonpagedBytes { get; set; }
    }
    [DllImport("ntdll.dll")]
    private static extern int NtQuerySystemInformation(int info, IntPtr buffer, int length, out int returned);
    public static Row[] Read() {
        int size = 1024 * 1024;
        for (int attempt = 0; attempt < 6; attempt++) {
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try {
                int returned;
                int status = NtQuerySystemInformation(22, buffer, size, out returned);
                if (status == unchecked((int)0xC0000004)) {
                    size = Math.Max(size * 2, returned + 65536);
                    if (size > 64 * 1024 * 1024) throw new Exception("Diagnostic buffer limit exceeded.");
                    continue;
                }
                if (status != 0) throw new Exception("NtQuerySystemInformation status 0x" + status.ToString("X8"));
                int count = Marshal.ReadInt32(buffer);
                int offset = IntPtr.Size;
                int stride = Marshal.SizeOf(typeof(PoolTag));
                if (count < 0 || (long)offset + (long)count * stride > size) throw new Exception("Unexpected pool-tag layout.");
                var rows = new List<Row>(count);
                for (int i = 0; i < count; i++) {
                    var entry = (PoolTag)Marshal.PtrToStructure(IntPtr.Add(buffer, offset + i * stride), typeof(PoolTag));
                    byte[] bytes = BitConverter.GetBytes(entry.Tag);
                    rows.Add(new Row { Tag = System.Text.Encoding.ASCII.GetString(bytes), PagedBytes = entry.PagedUsed.ToUInt64(), NonpagedBytes = entry.NonPagedUsed.ToUInt64() });
                }
                return rows.ToArray();
            } finally { Marshal.FreeHGlobal(buffer); }
        }
        throw new Exception("Pool snapshot changed repeatedly; no result returned.");
    }
}
'@
$rows = [PatrolAuditPoolSnapshot]::Read() | Sort-Object NonpagedBytes -Descending
$outputPath = Join-Path $PSScriptRoot '../audit-output/server-performance-20260927/kernel-pool-tags.json'
@{ sampledAt=(Get-Date).ToString('o'); tags=@($rows) } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $outputPath -Encoding utf8
$rows | Select-Object -First 15 Tag,@{n='NonpagedMiB';e={[Math]::Round($_.NonpagedBytes/1MB,2)}},@{n='PagedMiB';e={[Math]::Round($_.PagedBytes/1MB,2)}} | Format-Table -AutoSize
