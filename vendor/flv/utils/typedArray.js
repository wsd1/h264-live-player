
class typedArray{
    static concatenate(resultConstructor, ...arrays) {
        let totalLength = 0;
        for (let arr of arrays) {
            totalLength += arr.length;
        }
        let result = new resultConstructor(totalLength);
        let offset = 0;
        for (let arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }
        return result;
    }

    static joinArray(resultConstructor, arrays) {
        let totalLength = 0;
        for (let idx in arrays) {
            totalLength += arrays[idx].length;
        }
        let result = new resultConstructor(totalLength);
        let offset = 0;
        for (let idx in arrays) {
            result.set(arrays[idx], offset);
            offset += arrays[idx].length;
        }
        return result;
    }

}

module.exports = typedArray;