const { js2xml } = require('xml-js');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { info } = require('console');

module.exports = { makeCbz }

function countFiles(dir) {
    let count = 0;
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
            count += countFiles(filePath);
        } else if (stats.isFile() && !file.endsWith('xml')) {
            count++;
        }
    });

    return count;
}

function composeMetadataXml(folder, comicInfo, chapterInfo, volumeSplitMultiplier = 0) {
    const {chapterName, volumeName, volumeOrdinal, chapterOrdinal, updatedAt} = chapterInfo
    const [year, month, day] = chapterInfo.updatedAt.split('-')
    let fileCount = countFiles(folder)
    const authorString = comicInfo.authors.join(', ')
    const tagString = comicInfo.tags.join(', ')

    let comicInfoXmlObj = {
        _declaration: {
            _attributes: {
                version: "1.0",
                encoding: "utf-8"
            }
        },
        ComicInfo: {
            Title: { _text: `${volumeName} ${chapterName}` },
            Series: { _text: comicInfo.title },
            Number: { _text: chapterOrdinal + volumeSplitMultiplier * Math.max(volumeOrdinal - 1, 0) }, //We want chapters starts from 1 not volumeOrdinal * multiplier + 1
            // Volume: { _text: volumeName },
            Summary: { _text: comicInfo.description },
            Year: { _text: year },
            Month: { _text: month },
            Day: { _text: day },
            Writer: { _text:  authorString},
            Tags: { _text: tagString },
            Manga: {_text: "Yes"},
            PageCount: {_text: fileCount},
        },
        
    }
    let xml = js2xml(comicInfoXmlObj, {compact: true, spaces: 4})
    fs.writeFileSync(path.join(folder, 'ComicInfo.xml'), xml)
}

function workCrawlerMetadataBridge(workData, chapterNo) {
    if (chapterNo < 1 || chapterNo > workData.chapter_list.length) {
        console.error(`Chapter number ${chapterNo} is out of range`)
        return null;
    }
    let volumeMap = {}
    let currentVolumeOrdinal = 0
    //chapterNo is actually not the same as in work_data, it's just the index.
    workData.chapter_list.forEach(c => {
        if (c.NO_in_part == 1) {
            currentVolumeOrdinal ++;
            volumeMap[c.part_title] = currentVolumeOrdinal
        }
    })
    console.log("Volume map", volumeMap)
    const c = workData.chapter_list[chapterNo - 1]
    return {
        //ComicInfo
        comicInfo: {
            authors: [workData.author],
            title: workData.book_name,
            tags: workData.category.split(' '),
            description: workData.description,
            web: workData.read_url,
        },
        chapterInfo: {
            chapterName: c.title,
            volumeName: c.part_title,
            chapterOrdinal: c.NO_in_part,
            volumeOrdinal: volumeMap[c.part_title],
            updatedAt: workData.update_time, //Does not support per chapter update time
            directory: path.dirname(c.image_list[0].file)
        }
    }
}

function compressDirectoryAlt(inputDir, outputFilePath, level = 0) {
    return new Promise((resolve, reject) => {
        exec(`cd \"${inputDir}\" && zip -${level}r \"${outputFilePath}\" ./`, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                reject(error);
                return;
            }
            resolve(true);
        });
    });
}

/**
 * 
 * @param {string} comicFolder Folder containing comic images and `info.json`
 * @param {string} cbzRoot Root folder of all abz files, which is the comic library.
 * @param {number} volumeSplitMultiplier We need to flatten the volume > chapter structure. This value controls how we tweak the ordinal of the chapter to push the chapters of other volumes to another section, for example chapter 1 of volume 2 will be 1001. Default is 0, which means no split.
 */
async function makeCbz(cbzRoot, workData, chapterNo, volumeSplitMultiplier = 1000) {
    let {comicInfo, chapterInfo} = workCrawlerMetadataBridge(workData, chapterNo)
    if (!comicInfo || !chapterInfo ) {
        console.error(`Cannot resolve metadata for chapter #${chapterNo}`)
        return;
    }
    console.log("Resolved work_crawler metadata", comicInfo, chapterInfo)
    let cbzFolder = path.join(cbzRoot, comicInfo.title)
    if (!fs.existsSync(cbzFolder)) {
        fs.mkdirSync(cbzFolder, {recursive: true})
    }
    //Flush the metadata
    fs.writeFileSync(path.join(cbzFolder, 'info.json'), JSON.stringify({
        lastFetched: new Date(),
        comicInfo: comicInfo,
        dataRoot: workData.directory,
        siteName: workData.site_name,
    }, null, 2));
    const chapterFolder = chapterInfo.directory
    // let chapterCbz = path.join(cbzFolder, volume.title, `${chapter.chapterTitle}.cbz`)
    let chapterCbz = path.join(cbzFolder, `${chapterInfo.volumeName} - ${chapterInfo.chapterName}.cbz`)
    if (!fs.existsSync(path.dirname(chapterCbz))) {
        fs.mkdirSync(path.dirname(chapterCbz), { recursive: true })
    }
    console.log(`Zipping ${chapterInfo.chapterName} to ${chapterCbz}`)
    if (!fs.existsSync(chapterFolder)) {
        fs.mkdirSync(chapterFolder, { recursive: true })
    }
    composeMetadataXml(chapterFolder, comicInfo, chapterInfo, volumeSplitMultiplier)
    // if (chapterNum == 1) {
    //     console.log(`Copying cover.jpg to first chapter to help Komga to find it correctly`)
    //     fs.copyFileSync(path.join(comicFolder, 'cover.jpg'), path.join(chapterFolder, '0.jpg'))
    // }
    await compressDirectoryAlt(chapterFolder, chapterCbz, 1).then(() => {
        console.log(`Successfully zipped ${chapterCbz}`)
    }).catch(e => {
        console.error(`Error zipping ${chapterCbz} with ${e}`)
    })
}


