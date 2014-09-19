var util = require('@grid/util');

module.exports = (function (_grid) {
    var grid = _grid;
    var model = {row: 0, col: 0};

    grid.pixelScrollModel.addListener(function () {
        var scrollTop = grid.pixelScrollModel.top;
        var row = grid.virtualPixelCellModel.getRow(scrollTop);

        var scrollLeft = grid.pixelScrollModel.left;
        var col = grid.virtualPixelCellModel.getCol(scrollLeft);

        model.scrollTo(row, col);
    });

    model.scrollTo = function (r, c) {
        var maxRow = grid.rowModel.length() - 1;
        var maxCol = grid.colModel.length() - 1;
        model.row = util.clamp(r, 0, maxRow);
        model.col = util.clamp(c, 0, maxCol);
    };
    
    
    return model;
})