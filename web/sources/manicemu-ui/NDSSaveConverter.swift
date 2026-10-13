//
//  NDSSaveConventer.swift
//  ManicEmu
//
//  Created by Daiuno on 2026/2/10.
//  Copyright © 2026 Manic EMU. All rights reserved.
//

import Foundation

struct NDSSaveConverter {
    enum SaveType {
        case unknown, sav, dsv
    }
    
    // MARK: - Footer Constants
    
    /// DeSmuME DSV footer的大小
    /// = footerText(82字节) + BackupDeviceFileSaveFooter(24字节) + cookie(16字节) = 122字节
    private static let footerSize = 122
    
    /// Human-readable footer文本: "|<--Snip above here to create a raw sav by excluding this DeSmuME savedata footer:"
    private static let footerText: [UInt8] = [
        0x7C, 0x3C, 0x2D, 0x2D, 0x53, 0x6E, 0x69, 0x70, 0x20, 0x61, 0x62, 0x6F, 0x76, 0x65, 0x20, 0x68,
        0x65, 0x72, 0x65, 0x20, 0x74, 0x6F, 0x20, 0x63, 0x72, 0x65, 0x61, 0x74, 0x65, 0x20, 0x61, 0x20,
        0x72, 0x61, 0x77, 0x20, 0x73, 0x61, 0x76, 0x20, 0x62, 0x79, 0x20, 0x65, 0x78, 0x63, 0x6C, 0x75,
        0x64, 0x69, 0x6E, 0x67, 0x20, 0x74, 0x68, 0x69, 0x73, 0x20, 0x44, 0x65, 0x53, 0x6D, 0x75, 0x4D,
        0x45, 0x20, 0x73, 0x61, 0x76, 0x65, 0x64, 0x61, 0x74, 0x61, 0x20, 0x66, 0x6F, 0x6F, 0x74, 0x65,
        0x72, 0x3A
    ] // 82 bytes
    
    /// DSV footer的结束标记 "|-DESMUME SAVE-|"
    private static let cookieBytes: [UInt8] = [
        0x7C, 0x2D, 0x44, 0x45, 0x53, 0x4D, 0x55, 0x4D, 0x45, 0x20, 0x53, 0x41, 0x56, 0x45, 0x2D, 0x7C
    ] // 16 bytes
    
    // MARK: - Public Methods
    
    /// sav文件转dsv文件（原地转换）
    /// - Parameter saveUrl: sav文件路径
    /// - Returns: 转换是否成功
    @discardableResult
    static func savToDsv(saveUrl: URL) -> Bool {
        guard let saveData = try? Data(contentsOf: saveUrl) else {
            return false
        }
        
        let savSize = UInt32(saveData.count)
        
        // 构建footer
        var outputData = saveData
        
        // 1. 追加human-readable文本 (82字节)
        outputData.append(contentsOf: footerText)
        
        // 2. 追加 BackupDeviceFileSaveFooter 结构 (24字节, Little Endian)
        //    - size (u32): 实际写入的数据大小
        //    - padSize (u32): 填充后的大小（原始sav大小）
        //    - type (u32): 存储类型（设为0）
        //    - addr_size (u32): 地址总线大小
        //    - mem_size (u32): 存储大小（设为0）
        //    - version (u32): 版本号（必须为0）
        outputData.append(contentsOf: writeUInt32LE(savSize))      // size
        outputData.append(contentsOf: writeUInt32LE(savSize))      // padSize
        outputData.append(contentsOf: writeUInt32LE(0))            // type (unused)
        outputData.append(contentsOf: writeUInt32LE(addrSizeForSaveSize(savSize))) // addr_size
        outputData.append(contentsOf: writeUInt32LE(0))            // mem_size (unused)
        outputData.append(contentsOf: writeUInt32LE(0))            // version (must be 0)
        
        // 3. 追加cookie标记 (16字节)
        outputData.append(contentsOf: cookieBytes)
        
        do {
            try outputData.write(to: saveUrl)
            return true
        } catch {
            return false
        }
    }
    
    /// dsv文件转sav文件（原地转换）
    /// - Parameter saveUrl: dsv文件路径
    /// - Returns: 转换是否成功
    @discardableResult
    static func dsvToSav(saveUrl: URL) -> Bool {
        guard let saveData = try? Data(contentsOf: saveUrl) else {
            return false
        }
        
        // 确保文件足够大，可以包含footer
        guard saveData.count > footerSize else {
            return false
        }
        
        // 验证这是一个有效的DSV文件
        let cookieStart = saveData.count - cookieBytes.count
        let fileCookie = saveData[cookieStart..<saveData.count]
        guard fileCookie.elementsEqual(cookieBytes) else {
            return false
        }
        
        // 读取footer中的padSize来确定原始sav数据的大小
        // padSize位于footer末尾 - 16(cookie) - 24 + 4 = 末尾 - 36 处
        let padSizeOffset = saveData.count - 16 - 24 + 4
        let padSize = readUInt32LE(saveData, offset: padSizeOffset)
        
        // 使用padSize作为sav数据的大小（如果有效），否则使用计算值
        let savDataSize: Int
        if padSize > 0 && padSize <= saveData.count - footerSize {
            savDataSize = Int(padSize)
        } else {
            savDataSize = saveData.count - footerSize
        }
        
        let trimmedData = saveData.prefix(savDataSize)
        
        do {
            try trimmedData.write(to: saveUrl)
            return true
        } catch {
            return false
        }
    }
    
    /// 检查存档文件类型
    /// - Parameter fileURL: 文件路径
    /// - Returns: 存档类型（sav、dsv或unknown）
    static func checkSaveType(fileURL: URL) -> SaveType {
        guard let fileHandle = try? FileHandle(forReadingFrom: fileURL) else {
            return .unknown
        }
        
        defer {
            try? fileHandle.close()
        }
        
        // 获取文件大小
        guard let fileSize = try? fileHandle.seekToEnd(), fileSize > footerSize else {
            return .unknown
        }
        
        // 读取文件末尾的cookie区域来检测
        let cookieLength = UInt64(cookieBytes.count)
        try? fileHandle.seek(toOffset: fileSize - cookieLength)
        
        guard let cookieData = try? fileHandle.read(upToCount: Int(cookieLength)) else {
            return .unknown
        }
        
        // 检查末尾是否包含 "|-DESMUME SAVE-|" 标记
        if cookieData.elementsEqual(cookieBytes) {
            return .dsv
        }
        
        // 不是dsv，假设是sav格式
        return .sav
    }
    
    // MARK: - Private Helpers
    
    /// 将UInt32写入为Little Endian字节数组
    private static func writeUInt32LE(_ value: UInt32) -> [UInt8] {
        return [
            UInt8(value & 0xFF),
            UInt8((value >> 8) & 0xFF),
            UInt8((value >> 16) & 0xFF),
            UInt8((value >> 24) & 0xFF)
        ]
    }
    
    /// 从Data中读取Little Endian的UInt32
    private static func readUInt32LE(_ data: Data, offset: Int) -> UInt32 {
        guard offset + 4 <= data.count else { return 0 }
        return UInt32(data[offset]) |
               (UInt32(data[offset + 1]) << 8) |
               (UInt32(data[offset + 2]) << 16) |
               (UInt32(data[offset + 3]) << 24)
    }
    
    /// 根据存档大小确定地址总线大小
    /// 参考 mc.cpp 中的 addr_size_for_old_save_size
    private static func addrSizeForSaveSize(_ size: UInt32) -> UInt32 {
        switch size {
        case 0x200:      // 512B = 4Kbits
            return 1
        case 0x2000,     // 8KB = 64Kbits
             0x8000,     // 32KB = 256Kbits
             0x10000:    // 64KB = 512Kbits
            return 2
        case 0x20000,    // 128KB = 1Mbits
             0x40000,    // 256KB = 2Mbits
             0x80000,    // 512KB = 4Mbits
             0x100000,   // 1MB = 8Mbits
             0x200000,   // 2MB = 16Mbits
             0x800000:   // 8MB = 64Mbits
            return 3
        default:
            // 根据大小范围推断
            if size <= 0x200 {
                return 1
            } else if size <= 0x10000 {
                return 2
            } else {
                return 3
            }
        }
    }
}

