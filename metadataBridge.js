const fs = require('fs');
const path = require('path');

function findAndParseNumbers(inputString) {
    const regex = /-?\d+(\.\d+)?/g;
    const matches = inputString.match(regex);
    if (matches === null) {
        return null;
    }
    const numbers = matches.map(Number);
    return numbers;
}

function calculateDateOffset(baseDate, dayOffset) {
    const DAY_IN_MILLISECONDS = 86400000; // 24 * 60 * 60 * 1000
    const baseTime = baseDate.getTime();
    const offsetTime = baseTime + (dayOffset * DAY_IN_MILLISECONDS);
    return new Date(offsetTime);
}



function listFoldersSync(dirPath) {
    const items = fs.readdirSync(dirPath);
    const folders = [];
    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        if (fs.statSync(itemPath).isDirectory()) {
            folders.push(item);
        }
    }
    return folders;
}

function commonMetadataResolver (workData, chapterNo) {
        let volumeMap = {}
        let currentVolumeOrdinal = 0
        //chapterNo is actually not the same as in work_data, it's just the index.
        workData.chapter_list.forEach(c => {
            if (c.NO_in_part == 1) {
                currentVolumeOrdinal++;
                volumeMap[c.part_title] = currentVolumeOrdinal
            }
        })
        console.log("Volume map", volumeMap)
        
        const c = workData.chapter_list[chapterNo - 1]
        const chaptersRoot = workData.directory
        const chapterFolder = listFoldersSync(chaptersRoot).find(f => f.includes(c.title))
        if (!chapterFolder) {
            console.error(`Chapter directory not found for chapter ${c.title}`)
            return null
        }
        
        return {
            //ComicInfo
            comicInfo: {
                authors: workData.author.split(/\s+/),
                title: workData.title,
                
                description: workData.description,
                web: workData.read_url,
            },
            chapterInfo: {
                chapterName: c.title,
                volumeName: c.part_title,
                chapterOrdinal: c.NO_in_part,
                volumeOrdinal: volumeMap[c.part_title],
                directory: path.join(chaptersRoot, chapterFolder),
            }
        }

    }

module.exports = {
    commonMetadataResolver: commonMetadataResolver,
    dm5MetadataResolver: (workData, chapterNo) => {
        let {comicInfo, chapterInfo} = commonMetadataResolver(workData, chapterNo);
        //DM5 specific metadata:
        comicInfo.tags = workData.status.split(' ')
        comicInfo.coverUrl = workData.image
        const possibleRatings = findAndParseNumbers(workData.score)
        comicInfo.communityRating = possibleRatings ? possibleRatings[0] : null
        comicInfo.suggestedVolumeSplit = 0
        let updateDateYmd = findAndParseNumbers(workData.last_update)
        let lastUpdateDate = new Date();
        const thisYear = new Date().getFullYear()
        if (updateDateYmd) {
            switch (updateDateYmd.length) {
                case 3:
                    lastUpdateDate = new Date(updateDateYmd[0], updateDateYmd[1] - 1, updateDateYmd[2])
                    break;
                case 2:
                    lastUpdateDate = new Date(thisYear, updateDateYmd[0] - 1, updateDateYmd[1])
                    break;
                // default:
                //     lastUpdateDate = new Date()
            }
        }
        dateOffset = (workData.chapter_list.length - chapterNo) * 30; //One month for offset
        generatedUpdateDate = calculateDateOffset(lastUpdateDate, -dateOffset)
        chapterInfo.updatedAt = [generatedUpdateDate.getFullYear(), generatedUpdateDate.getMonth() + 1, generatedUpdateDate.getDate()]
        
        chapterInfo.chapterName = workData.chapter_list[chapterNo - 1].title.replace(/\s*.\d+P.\s*/, '')
        return {comicInfo: comicInfo, chapterInfo: chapterInfo}
    },

    manhuadbMetadataResolver: (workData, chapterNo) => {
        let {comicInfo, chapterInfo} = commonMetadataResolver(workData, chapterNo);
        //Manhuadb specific metadata:
        comicInfo.genre = workData.category.split(' ')
        comicInfo.tags = [workData.status] //已完结
        const lastUpdateDate = new Date(workData.update_time)
        dateOffset = (workData.chapter_list.length - chapterNo) * 30;
        generatedUpdateDate = calculateDateOffset(lastUpdateDate, -dateOffset)
        chapterInfo.updatedAt = [generatedUpdateDate.getFullYear(), generatedUpdateDate.getMonth() + 1, generatedUpdateDate.getDate()]
        return {comicInfo: comicInfo, chapterInfo: chapterInfo}

    }
}