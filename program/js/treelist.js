/*
 +-----------------------------------------------------------------------+
 | Roundcube Treelist widget                                             |
 |                                                                       |
 | This file is part of the Roundcube Webmail client                     |
 | Copyright (C) 2013, The Roundcube Dev Team                            |
 |                                                                       |
 | Licensed under the GNU General Public License version 3 or            |
 | any later version with exceptions for skins & plugins.                |
 | See the README file for a full license statement.                     |
 |                                                                       |
 +-----------------------------------------------------------------------+
 | Authors: Thomas Bruederli <roundcube@gmail.com>                       |
 +-----------------------------------------------------------------------+
 | Requires: common.js                                                   |
 +-----------------------------------------------------------------------+
*/


/**
 * Roundcube Treelist widget class
 * @contructor
 */
function rcube_treelist_widget(node, p)
{
	// apply some defaults to p
	p = $.extend({
		id_prefix: '',
		autoexpand: 1000,
		selectable: false,
		check_droptarget: function(node){ return !node.virtual }
	}, p || {});

	var container = $(node);
	var data = p.data || [];
	var indexbyid = {};
	var selection = null;
	var drag_active = false;
	var box_coords = {};
	var item_coords = [];
	var autoexpand_timer;
	var autoexpand_item;
	var body_scroll_top = 0;
	var list_scroll_top = 0;
	var me = this;


	/////// export public members and methods

	this.container = container;
	this.expand = expand;
	this.collapse = collapse;
	this.select = select;
	this.render = render;
	this.drag_start = drag_start;
	this.drag_end = drag_end;
	this.intersects = intersects;


	/////// startup code (constructor)

	// abort if node not found
	if (!container.length)
		return;

	if (p.data) {
		index_data({ children:data });
	}
	// load data from DOM
	else {
		data = walk_list(container);
		// console.log(data);
	}

	// register click handlers on list
	container.on('click', 'div.treetoggle', function(e){
		toggle(dom2id($(this).parent()));
	});

	container.on('click', 'li', function(e){
		var node = p.selectable ? indexbyid[dom2id($(this))] : null;
		if (node && !node.virtual) {
			select(node.id);
			e.stopPropagation();
		}
	});


	/////// private methods

	/**
	 * Collaps a the node with the given ID
	 */
	function collapse(id, recursive, set)
	{
		var node;
		if (node = indexbyid[id]) {
			node.collapsed = typeof set == 'undefined' || set;
			update_dom(node);

			// Work around a bug in IE6 and IE7, see #1485309
			if (window.bw && (bw.ie6 || bw.ie7) && node.collapsed) {
				id2dom(node.id).next().children('ul:visible').hide().show();
			}

			if (recursive && node.children) {
				for (var i=0; i < node.children.length; i++) {
					collapse(node.children[i].id, recursive, set);
				}
			}

			me.triggerEvent(node.collapsed ? 'collapse' : 'expand', node);
		}
	}

	/**
	 * Expand a the node with the given ID
	 */
	function expand(id, recursive)
	{
		collapse(id, recursive, false);
	}

	/**
	 * Toggle collapsed state of a list node
	 */
	function toggle(id, recursive)
	{
		var node;
		if (node = indexbyid[id]) {
			collapse(id, recursive, !node.collapsed);
		}
	}

	/**
	 * Select a tree node by it's ID
	 */
	function select(id)
	{
		if (selection) {
			id2dom(selection).removeClass('selected');
			selection = null;
		}

		var li = id2dom(id);
		if (li.length) {
			li.addClass('selected');
			selection = id;
			// TODO: expand all parent nodes if collapsed
			scroll_to_node(li);
		}

		me.triggerEvent('select', indexbyid[id]);
	}

	/**
	 * Getter for the currently selected node ID
	 */
	function get_selection()
	{
		return selection;
	}

	/**
	 * Return the DOM element of the list item with the given ID
	 */
	function get_item(id)
	{
		return id2dom(id).get(0);
	}

	/**
	 * Apply the 'collapsed' status of the data node to the corresponding DOM element(s)
	 */
	function update_dom(node)
	{
		var li = id2dom(node.id);
		li.children('ul').first()[(node.collapsed ? 'hide' : 'show')]();
		li.children('div.treetoggle').removeClass('collapsed expanded').addClass(node.collapsed ? 'collapsed' : 'expanded');
		me.triggerEvent('toggle', node);
	}

	/**
	 * Render the tree list from the internal data structure
	 */
	function render()
	{
		if (me.triggerEvent('renderBefore', data) === false)
			return;

		// remove all child nodes
		container.html('');

		// render child nodes
		for (var i=0; i < data.length; i++) {
			render_node(data[i], container);
		}

		me.triggerEvent('renderAfter', container);
	}

	/**
	 * Render a specific node into the DOM list
	 */
	function render_node(node, parent)
	{
		var li = $('<li>' + node.html + '</li>')
			.attr('id', p.id_prefix + node.id)
			.addClass((node.classes || []).join(' '))
			.appendTo(parent);

		if (node.virtual)
			li.addClass('virtual');
		if (node.id == selection)
			li.addClass('selected');

		// add child list and toggle icon
		if (node.children && node.children.length) {
			$('<div class="treetoggle '+(node.collapsed ? 'collapsed' : 'expanded') + '">&nbsp;</div>').appendTo(li);
			var ul = $('<ul>').appendTo(li);
			if (node.collapsed)
				ul.hide();

			for (var i=0; i < node.children.length; i++) {
				render_node(node.children[i], ul);
			}
		}
	}

	/**
	 * Recursively walk the DOM tree and build an internal data structure
	 * representing the skeleton of this tree list.
	 */
	function walk_list(ul)
	{
		var result = [];
		ul.children('li').each(function(i,e){
			var li = $(e);
			var node = {
				id: dom2id(li),
				classes: li.attr('class').split(' '),
				virtual: li.hasClass('virtual'),
				html: li.children().first().get(0).outerHTML,
				children: walk_list(li.children('ul'))
			}

			if (node.children.length) {
				node.collapsed = li.children('ul').css('display') == 'none';
			}
			if (li.hasClass('selected')) {
				selection = node.id;
			}

			result.push(node);
			indexbyid[node.id] = node;
		})

		return result;
	}

	/**
	 * Recursively walk the data tree and index nodes by their ID
	 */
	function index_data(node)
	{
		if (node.id) {
			indexbyid[node.id] = node;
		}
		for (var c=0; node.children && c < node.children.length; c++) {
			index_data(node.children[c]);
		}
	}

	/**
	 * Get the (stripped) node ID from the given DOM element
	 */
	function dom2id(li)
	{
		var domid = li.attr('id').replace(new RegExp('^' + (p.id_prefix) || '%'), '');
		return p.id_decode ? p.id_decode(domid) : domid;
	}

	/**
	 * Get the <li> element for the given node ID
	 */
	function id2dom(id)
	{
		var domid = p.id_encode ? p.id_encode(id) : id;
		return $('#' + p.id_prefix + domid);
	}

	/**
	 * Scroll the parent container to make the given list item visible
	 */
	function scroll_to_node(li)
	{
		var scroller = container.parent();
		scroller.scrollTop(li.offset().top - scroller.offset().top + scroller.scrollTop());
	}

	///// drag & drop support

	/**
	 * When dragging starts, compute absolute bounding boxes of the list and it's items
	 * for faster comparisons while mouse is moving
	 */
	function drag_start()
	{
		var li, item, height,
			pos = container.offset();

		body_scroll_top = bw.ie ? 0 : window.pageYOffset;
		list_scroll_top = container.parent().scrollTop();

		drag_active = true;
		box_coords = {
			x1: pos.left,
			y1: pos.top,
			x2: pos.left + container.width(),
			y2: pos.top + container.height()
		};

		item_coords = [];
		for (var id in indexbyid) {
			li = id2dom(id);
			item = li.children().first().get(0);
			if (height = item.offsetHeight) {
				pos = $(item).offset();
				item_coords[id] = {
					x1: pos.left,
					y1: pos.top,
					x2: pos.left + item.offsetWidth,
					y2: pos.top + height,
					on: id == autoexpand_item
				};
			}
		}
	}

	/**
	 * Signal that dragging has stopped
	 */
	function drag_end()
	{
		drag_active = false;

		if (autoexpand_timer) {
			clearTimeout(autoexpand_timer);
			autoexpand_timer = null;
			autoexpand_item = null;
		}

		$('li.droptarget', container).removeClass('droptarget');
	}

	/**
	 * Determine if the given mouse coords intersect the list and one if its items
	 */
	function intersects(mouse, highlight)
	{
		// offsets to compensate for scrolling while dragging a message
		var boffset = bw.ie ? -document.documentElement.scrollTop : body_scroll_top,
			moffset = list_scroll_top - container.parent().scrollTop(),
			result = null;

		mouse.top = mouse.y + -moffset - boffset;

		// no intersection with list bounding box
		if (mouse.x < box_coords.x1 || mouse.x >= box_coords.x2 || mouse.top < box_coords.y1 || mouse.top >= box_coords.y2) {
		  // TODO: optimize performance for this operation
		  $('li.droptarget', container).removeClass('droptarget');
			return result;
		}

		// check intersection with visible list items
		var pos, node;
		for (var id in item_coords) {
			pos = item_coords[id];
			if (mouse.x >= pos.x1 && mouse.x < pos.x2 && mouse.top >= pos.y1 && mouse.top < pos.y2) {
				node = indexbyid[id];

				// if the folder is collapsed, expand it after the configured time
				if (node.children && node.children.length && node.collapsed && p.autoexpand && autoexpand_item != id) {
					if (autoexpand_timer)
						clearTimeout(autoexpand_timer);

					autoexpand_item = id;
					autoexpand_timer = setTimeout(function() {
						expand(autoexpand_item);
						drag_start();  // re-calculate item coords
						autoexpand_item = null;
					}, p.autoexpand);
				}
				else if (autoexpand_timer && autoexpand_item != id) {
					clearTimeout(autoexpand_timer);
					autoexpand_item = null;
					autoexpand_timer = null;
				}

				// check if this item is accepted as drop target
				if (p.check_droptarget(node)) {
					if (highlight) {
						id2dom(id).addClass('droptarget');
						pos.on = true;
					}
					result = id;
				}
				else {
					result = null;
				}
			}
			else if (pos.on) {
				id2dom(id).removeClass('droptarget');
				pos.on = false;
			}
		}

		return result;
	}
}

// use event processing functions from Roundcube's rcube_event_engine
rcube_treelist_widget.prototype.addEventListener = rcube_event_engine.prototype.addEventListener;
rcube_treelist_widget.prototype.removeEventListener = rcube_event_engine.prototype.removeEventListener;
rcube_treelist_widget.prototype.triggerEvent = rcube_event_engine.prototype.triggerEvent;