var key = require('key');
var arrow = key.code.arrow;
var util = require('../util');
var rangeUtil = require('../range-util');
var ctrlOrCmd = require('../ctrl-or-cmd');

module.exports = function(_grid) {
    var grid = _grid;

    var model = {
        focus: {
            row: 0,
            col: 0
        }
    };

    model.otherSelections = [];

    var focusClass = grid.cellClasses.create(0, 0, 'focus');
    grid.cellClasses.add(focusClass);

    model.focusDecorator = grid.decorators.create(0, 0, 1, 1);
    var focusDefaultRender = model.focusDecorator.render;
    model.focusDecorator.render = function() {
        var div = focusDefaultRender();
        div.setAttribute('class', 'grid-focus-decorator');
        return div;
    };
    grid.decorators.add(model.focusDecorator);

    model.setFocus = function setFocus(row, col, dontClearSelection) {
        row = grid.data.row.clamp(row);
        col = grid.data.col.clamp(col);
        var changed = row !== model.focus.row || col !== model.focus.col;
        model.focus.row = row;
        model.focus.col = col;
        focusClass.top = row;
        focusClass.left = col;
        model.focusDecorator.top = row;
        model.focusDecorator.left = col;
        grid.cellScrollModel.scrollIntoView(row, col);
        if (!dontClearSelection) {
            clearOtherSelections();
        }
        setSelectionToFocus();
        if (changed) {
            grid.eventLoop.fire('grid-focus-change');
        }
    };

    function seekNextEdge(newIndex, startedDefined, isForwardEdge, isBackwardEdge, goForward) {

        var isEdgeToSeek;
        if (isForwardEdge(newIndex) || !startedDefined) {
            isEdgeToSeek = isBackwardEdge;
        } else {
            isEdgeToSeek = isForwardEdge;
        }

        while (goForward(newIndex) !== undefined && !isEdgeToSeek(newIndex = goForward(newIndex))) { // jshint ignore: line
            //empty
        }
        return newIndex;
    }

    function navFrom(row, col, e) {
        //if nothing changes great we'll stay where we are
        var newRow = row;
        var newCol = col;
        var isSeek = ctrlOrCmd(e);
        var isLeftwardEdge, isRightwardEdge, isUpwardEdge, isDownwardEdge, cellHasValue, startedDefined;
        if (isSeek) {
            cellHasValue = function(r, c) {
                return !!grid.dataModel.get(r, c).formatted;
            };
            isLeftwardEdge = function(c) {
                return cellHasValue(newRow, c) && !cellHasValue(newRow, grid.data.left(c));
            };
            isRightwardEdge = function(c) {
                return cellHasValue(newRow, c) && !cellHasValue(newRow, grid.data.right(c));
            };
            isUpwardEdge = function(r) {
                return cellHasValue(r, newCol) && !cellHasValue(grid.data.up(r), newCol);
            };
            isDownwardEdge = function(r) {
                return cellHasValue(r, newCol) && !cellHasValue(grid.data.down(r), newCol);
            };
            startedDefined = cellHasValue(newRow, newCol);
        }
        switch (e.which) {
            case arrow.down.code:
                if (isSeek) {
                    newRow = seekNextEdge(newRow, startedDefined, isDownwardEdge, isUpwardEdge, grid.data.down);
                } else {
                    newRow = grid.data.down(newRow);
                }
                break;
            case arrow.up.code:
                if (isSeek) {
                    newRow = seekNextEdge(newRow, startedDefined, isUpwardEdge, isDownwardEdge, grid.data.up);
                } else {
                    newRow = grid.data.up(newRow);
                }
                break;
            case arrow.right.code:
                if (isSeek) {
                    newCol = seekNextEdge(newCol, startedDefined, isRightwardEdge, isLeftwardEdge, grid.data.right);
                } else {
                    newCol = grid.data.right(newCol);
                }
                break;
            case arrow.left.code:
                if (isSeek) {
                    newCol = seekNextEdge(newCol, startedDefined, isLeftwardEdge, isRightwardEdge, grid.data.left);
                } else {
                    newCol = grid.data.left(newCol);
                }
                break;
        }
        if (newRow === undefined) {
            newRow = row;
        }
        if (newCol === undefined) {
            newCol = col;
        }
        return {
            row: newRow,
            col: newCol
        };
    }

    model._navFrom = navFrom;


    grid.eventLoop.bind('keydown', function(e) {
        if (!key.is(arrow, e.which) || !grid.focused) {
            return;
        }
        //focus logic

        if (!e.shiftKey) {
            var newFocus = navFrom(model.focus.row, model.focus.col, e);
            model.setFocus(newFocus.row, newFocus.col, e);
        } else {
            //selection logic
            var newSelection;
            //stand in for if it's cleared
            if (model.selection.top === -1) {
                newSelection = {
                    top: model.focus.row,
                    left: model.focus.col,
                    height: 1,
                    width: 1
                };
            } else {
                newSelection = {
                    top: model.selection.top,
                    left: model.selection.left,
                    height: model.selection.height,
                    width: model.selection.width
                };
            }
            var navFromRow;
            var navFromCol;
            if (model.focus.row === newSelection.top) {
                navFromRow = newSelection.top + newSelection.height - 1;
            } else {
                navFromRow = newSelection.top;
            }

            if (model.focus.col === newSelection.left) {
                navFromCol = newSelection.left + newSelection.width - 1;
            } else {
                navFromCol = newSelection.left;
            }
            var newRowCol = navFrom(navFromRow, navFromCol, e);
            setSelectionFromPoints(model.focus.row, model.focus.col, newRowCol.row, newRowCol.col);
            grid.cellScrollModel.scrollIntoView(newRowCol.row, newRowCol.col);
        }
    });

    grid.eventLoop.bind('mousedown', function(e) {
        if (!grid.focused) {
            return;
        }
        //assume the event has been annotated by the cell mouse model interceptor
        var row = e.row;
        var col = e.col;

        var ctrlOrCmdPressed = ctrlOrCmd(e);

        if (e.shiftKey) {
            var fromRow = model.focus.row;
            var fromCol = model.focus.col;
            var toRow = row;
            var toCol = col;
            if (row < 0) {
                fromRow = 0;
                toRow = Infinity;
            }
            if (col < 0) {
                fromCol = 0;
                toCol = Infinity;
            }
            setSelectionFromPoints(fromRow, fromCol, toRow, toCol, ctrlOrCmdPressed);
        } else {
            if (ctrlOrCmdPressed) {
                addSelection(model.selection);
            }

            var focusRow = row;
            if (focusRow < 0) {
                focusRow = grid.view.row.toData(grid.rowModel.numHeaders());
            }
            var focusCol = col;
            if (focusCol < 0) {
                focusCol = grid.view.col.toData(grid.colModel.numHeaders());
            }
            model.setFocus(focusRow, focusCol, ctrlOrCmdPressed);

            if (row < 0 && col < 0) {
                setSelectionFromPoints(0, 0, Infinity, Infinity, ctrlOrCmdPressed);
            } else if (row < 0) {
                setSelectionFromPoints(0, col, Infinity, col, ctrlOrCmdPressed);
            } else if (col < 0) {
                setSelectionFromPoints(row, 0, row, Infinity, ctrlOrCmdPressed);
            }
        }
    });

    function addSelection(range) {
        model.otherSelections.push(createAndAddSelectionDecorator(range.top, range.left, range.height, range.width));
    }

    model._rowSelectionClasses = [];
    model._colSelectionClasses = [];
    //row col selection
    function handleRowColSelectionChange(rowOrCol) {
        var decoratorsField = ('_' + rowOrCol + 'SelectionClasses');
        model[decoratorsField].forEach(function(selectionDecorator) {
            grid.cellClasses.remove(selectionDecorator);
        });
        model[decoratorsField] = [];

        grid[rowOrCol + 'Model'].getSelected().forEach(function(index) {
            var virtualIndex = grid[rowOrCol + 'Model'].toVirtual(index);
            var top = rowOrCol === 'row' ? virtualIndex : 0;
            var left = rowOrCol === 'col' ? virtualIndex : 0;
            var decorator = grid.cellClasses.create(top, left, 'selected', 1, 1, 'virtual');
            grid.cellClasses.add(decorator);
            model[decoratorsField].push(decorator);
        });
    }

    grid.eventLoop.bind('grid-row-selection-change', function() {
        handleRowColSelectionChange('row');
    });

    grid.eventLoop.bind('grid-col-selection-change', function() {
        handleRowColSelectionChange('col');
    });

    function createAndAddSelectionDecorator() {
        var selection = grid.decorators.create.apply(this, arguments);
        var defaultRender = selection.render;
        selection.render = function() {
            var div = defaultRender();
            div.setAttribute('class', 'grid-selection');
            return div;
        };
        grid.decorators.add(selection);
        return selection;
    }

    var selection = createAndAddSelectionDecorator();

    function syncSelectionToHeaders() {
        grid.colModel.clearSelected(true);
        grid.rowModel.clearSelected(true);
        model.getAllSelections().forEach(function(selection) {
            if (selection) {
                maybeSelectHeaderFromSelection(selection);
            }
        });
    }

    model.getAllSelections = function() {
        var selections = [];
        if (model.selection) {
            selections.push(model.selection);
        }
        return selections.concat(model.otherSelections);
    };

    function maybeSelectHeaderFromSelection(range, deselect) {
        var indexes;
        if (range.height === Infinity) {
            indexes = grid.data.col.indexes({
                from: range.left,
                length: range.width
            });
            if (deselect) {
                grid.colModel.deselect(indexes);
            } else {
                grid.colModel.select(indexes);
            }
        }
        if (range.width === Infinity) {
            indexes = grid.data.row.indexes({
                from: range.top,
                length: range.height
            });
            if (deselect) {
                grid.rowModel.deselect(indexes);
            } else {
                grid.rowModel.select(indexes);
            }
        }
    }

    model.setSelection = function setSelection(newSelection) {
        var height = newSelection.height;
        var width = newSelection.width;
        if (height === 1 && width === 1 && !model.otherSelections.length) {
            height = -1;
            width = -1;
        }
        selection.top = newSelection.top;
        selection.left = newSelection.left;
        selection.height = height;
        selection.width = width;
        //select the columns to match
        syncSelectionToHeaders();
    };


    function setSelectionToFocus() {
        model.setSelection({
            top: model.focus.row,
            left: model.focus.col,
            height: 1,
            width: 1
        });
    }

    function clearOtherSelections() {
        grid.decorators.remove(model.otherSelections);
        syncSelectionToHeaders();
        model.otherSelections = [];
    }

    function setSelectionFromPoints(fromRow, fromCol, toRow, toCol, dontClearOthers) {
        if (!dontClearOthers) {
            clearOtherSelections();
        }
        toRow = util.clamp(toRow, 0, Infinity);
        toCol = util.clamp(toCol, 0, Infinity);
        var newSelection = rangeUtil.createFromPoints(fromRow, fromCol, toRow, toCol);
        model.setSelection(newSelection);
    }

    selection._onDragStart = function(e) {
        if (!grid.focused) {
            return;
        }
        var fromRow = model.focus.row;
        var fromCol = model.focus.col;
        var unbindDrag = grid.eventLoop.bind('grid-cell-drag', function(e) {
            var toRow = e.row;
            var toCol = e.col;
            if (selection.left === 0 && selection.width === Infinity) {
                toCol = Infinity;
            }
            if (selection.top === 0 && selection.height === Infinity) {
                toRow = Infinity;
            }
            //pass true to prevent clearing, if it were to be cleared the mousedown handles that
            setSelectionFromPoints(fromRow, fromCol, toRow, toCol, true);
        });
        var unbindDragEnd = grid.eventLoop.bind('grid-drag-end', function() {
            unbindDrag();
            unbindDragEnd();
        });
    };

    grid.eventLoop.bind('grid-drag-start', selection._onDragStart);
    setSelectionToFocus();
    model._selectionDecorator = selection;

    Object.defineProperty(model, 'selection', {
        get: function() {
            if (selection.height === -1) { //cleared selection default to focus
                return {
                    top: model.focus.row,
                    left: model.focus.col,
                    height: 1,
                    width: 1
                };
            }
            return selection;
        }
    });

    grid.eventLoop.bind('grid-col-change', function(e) {
        if (e.action === 'move') {
            setSelectionToFocus();
            clearOtherSelections();
        }
    });
    return model;
};