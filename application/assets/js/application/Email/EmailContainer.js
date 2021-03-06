Ext.ns('ExtMail', 'ExtMail.Email');
ExtMail.Email.EmailContainer = Ext.extend(Ext.Panel, {
	layout: 'border',
	selected: null,
	preview: null,
	dispensable: [],
	initComponent: function() {
		this.gridId = Ext.id();
		this.previewSouth = Ext.id();
		this.previewEast = Ext.id();
		
		this.preview = new ExtMail.Email.Preview({
			mainpanel: this.mainpanel,
			folder: this.folder,
			listeners: {
				source: this.showSource,
				removemessage: this.removeMessage,
				showimages: this.showImages,
				junk: this.markJunk,
				scope: this
			}
		});
		
		Ext.apply(this, {
			layout: 'border',
			border: false,
			items: [{
				xtype: 'extmail_email_emailgrid',
				id: this.gridId,
				region: 'center',
				mainpanel: this.mainpanel,
				folder: this.folder,
				listeners: {
					rowclick: this.rowClick,
					rowdblclick: this.rowDblClick,
					scope: this
				}
			}, {
				region: 'south',
				id: this.previewSouth,
				height: 300,
				split: true,
				border: false,
				layout: 'fit',
				items: [this.preview]
			}, {
				region: 'east',
				id: this.previewEast,
				width: 350,
				split: true,
				border: false,
				layout: 'fit',
				hidden: true
			}]
		});
		
		ExtMail.Email.EmailContainer.superclass.initComponent.call(this);
	},
	rowClick: function(grid, rowIndex, e) {
		if (!this.rowClickTask) {
			this.rowClickTask = new Ext.util.DelayedTask(this.doRowClick, this, [grid, rowIndex, e]);
		}
		this.rowClickTask.delay(200);
	},
	doRowClick: function(grid, rowIndex, e) {
		if (grid.getSelectionModel().getCount() === 1) {
			var r    = grid.getSelectionModel().getSelected(),
				me   = this,
				cell = e.getTarget('.x-grid3-col');
			if ((cell !== null) && ('flag' == grid.getColumnModel().getDataIndex(cell.cellIndex))) {
				if (r.get('flag')) {
					this.mainpanel.getSouth().showBusy(String.format(_('Remove flag from: "{0}" ...'), r.get('subject')));
				} else {
					this.mainpanel.getSouth().showBusy(String.format(_('Add flag to: "{0}" ...'), r.get('subject')));
				}
				
				Ext.Ajax.request({
					url: '/email/flag',
					params: {
						message: r.get('message'),
						flag: (r.get('flag') ? 0 : 1)
					},
					success: function() {
						r.set('flag', (r.get('flag') ? false : true));
						grid.getStore().commitChanges();
						me.mainpanel.getSouth().clearStatus();
					}
				});
			} else if (this.preview.isVisible()) {
				if (!this.getGrid().getSelectionModel().getSelected().get('deleted')) {
					this.getPreviewPanel().showLoading();
					var transId = Ext.Ajax.request({
						url: '/email/body',
						params: {
							folder: this.folder,
							message: r.get('message')
						},
						success: function(d) {
							me.getPreviewPanel().getTopToolbar().show();
							me.setRead(r);
							me.overwriteTemplates(me.getPreviewPanel(), r.data, me.prepareBody(d.responseText));
							me.resizePreviewPanel(me.getPreviewPanel());
							if (me.imagesBlocked) {
								me.getPreviewPanel().showImagesBlocked();
							}
							me.getPreviewPanel().scrollToTop();
							me.getPreviewPanel().hideLoading();
						}
					});
				}
			}
		}
	},
	rowDblClick: function(grid, rowIndex, e) {
		this.removeTask('rowClickTask');
		
		var me = this,
			controller = me.mainpanel.controller,
			r = me.getGrid().getSelectionModel().getSelected(),
			npId = Ext.id(),
			np;
		
		me.getPreviewPanel().hideLoading();
		
		controller.views.add(npId, new ExtMail.Email.Preview({
			title: r.get('subject'),
			iconCls: 'ico_email_open',
			controller: controller,
			closable: true,
			hideMenu: true,
			mainpanel: this.mainpanel,
			folder: this.folder,
			listeners: {
				source: this.showSource,
				removemessage: this.removeMessage,
				showimages: this.showImages,
				scope: this
			}
		}));
		
		np = controller.views.get(npId);
		controller.getMainContainer().add(np);
		controller.setActiveItem(npId);
		
		np.showLoading();
		np.on('removemessage', function(item) {
			if (item.fireEvent('beforeclose', item) !== false) {
				item.fireEvent('close', item);
				this.remove(item);
			}
			return;
		});
		Ext.Ajax.request({
			url: '/email/body',
			params: {
				folder: this.folder,
				message: r.get('message')
			},
			success: function(d) {
				np.getTopToolbar().show();
				me.setRead(r);
				me.overwriteTemplates(np, r.data, me.prepareBody(d.responseText));
				me.resizePreviewPanel(np);
				if (me.imagesBlocked) {
					np.showImagesBlocked();
				}
				np.scrollToTop();
				np.hideLoading();
			}
		});
	},
	getGrid: function() {
		return Ext.getCmp(this.gridId);
	},
	getPreviewPanel: function() {
		var p = null;
		if (Ext.isDefined(arguments[0])) {
			if (arguments[0] == 'south') {
				return Ext.getCmp(this.previewSouth);
			} else {
				return Ext.getCmp(this.previewEast);
			}
		} else {
			return this.preview;
		}
	},
    removeTask: function(name) {
        var task = this[name];
        if (task && task.cancel) {
            task.cancel();
            this[name] = null;
        }
    },
	movePreview: function(where) {
		switch (where) {
			case 'right':
				this.getPreviewPanel('south').hide();
				this.getPreviewPanel('east').add(this.getPreviewPanel());
				this.getPreviewPanel('east').show();
				break;
			case 'bottom':
				this.getPreviewPanel('east').hide();
				this.getPreviewPanel('south').add(this.getPreviewPanel());
				this.getPreviewPanel('south').show();
				break;
			case 'hide':
				this.getPreviewPanel().ownerCt.hide();
				this.getPreviewPanel().restoreDefault();
				break;
		}
		this.doLayout();
	},
	overwriteTemplates: function(previewPanel, headerData, bodyData) {
		previewPanel.getTemplate().overwrite(previewPanel.getHeader().body, headerData);
		previewPanel.getBody().update('<div class="email-body">' + bodyData + '</div>');
	},
	resizePreviewPanel: function(previewPanel) {
		var bodySize = previewPanel.getBody().getSize(),
			headerSize = previewPanel.getHeader().getSize(),
			fullSize = previewPanel.getSize(),
			tbarSize = previewPanel.getTopToolbar().getSize();
		
		previewPanel.getBody().setPosition(0, headerSize.height);
		previewPanel.getBody().setHeight(fullSize.height - headerSize.height - tbarSize.height);
	},
	prepareBody: function(body) {
		if (new RegExp('<img[^>]*>','g').test(body)) {
			this.imagesBlocked = true;
		} else {
			this.imagesBlocked = false;
		}
		body = Ext.util.Format.stripScripts(body);
		return body;
	},
	setRead: function(r) {
		if (r.get('seen') == false) {
			r.set('seen', true);
			--this.mainpanel.getWest().findByType('extmail_email_navigation')[0].getSelectionModel().getSelectedNode().attributes.newCount;
			this.mainpanel.getWest().findByType('extmail_email_navigation')[0].getSelectionModel().getSelectedNode().getUI().newEmailsLayout();
		}
	},
	showSource: function(w) {
		w.setTitle(String.format(_('Source of: {0}'), this.getGrid().getSelectionModel().getSelected().get('subject')));
		w.show();
		Ext.Ajax.request({
			url: '/email/source',
			params: {
				folder: this.folder,
				message: this.getGrid().getSelectionModel().getSelected().get('message')
			},
			success: function(d) {
				w.update('<div style="font-family: Courier">' + d.responseText + '</div>');
			}
		});
	},
	removeMessage: function(panel) {
		if (this.getGrid().getSelectionModel().getCount() > 0) {
			var me     = this,
				msgIds = [];
			Ext.each(this.getGrid().getSelectionModel().getSelections(), function(item) {
				msgIds.push(item.get('message'));
			});
			Ext.Ajax.request({
				url: '/email/remove',
				params: {
					folder: this.folder,
					messages: Ext.encode(msgIds)
				},
				success: function(d) {
					d = Ext.decode(d.responseText);
					if (d.success) {
						me.getGrid().getStore().remove(me.getGrid().getSelectionModel().getSelections());
						me.getPreviewPanel().restoreDefault();
						me.getPreviewPanel().doLayout();
						if (Ext.isDefined(panel.controller)) {
							panel.controller.getMainContainer().closeTab(panel);
						}
					}
				}
			});
		} else {
			App.getInstance().showError(_('Deleting messages'), _('There are no messages selected.'));
		}
	},
	showImages: function(panel) {
		panel.showLoading();
		if (this.getGrid().getSelectionModel().getCount() == 1) {
			var me = this,
				r = this.getGrid().getSelectionModel().getSelected();
			
			Ext.Ajax.request({
				url: '/email/body',
				params: {
					folder: this.folder,
					message: r.get('message'),
					showimages: 1
				},
				success: function(d) {
					panel.getTopToolbar().show();
					me.overwriteTemplates(panel, r.data, me.prepareBody(d.responseText));
					me.resizePreviewPanel(panel);
					panel.scrollToTop();
					panel.hideLoading();
				}
			});
		}
	},
	markJunk: function(panel) {
		if (this.getGrid().getSelectionModel().getCount() > 0) {
			var me     = this,
				msgIds = [];
			Ext.each(this.getGrid().getSelectionModel().getSelections(), function(item) {
				msgIds.push(item.get('message'));
			});
			
			Ext.Ajax.request({
				url: '/email/junk',
				params: {
					folder: this.folder,
					messages: Ext.encode(msgIds)
				},
				success: function(d) {
					d = Ext.decode(d.responseText);
					if (d.success) {
						me.getGrid().getStore().remove(me.getGrid().getSelectionModel().getSelections());
						me.getPreviewPanel().restoreDefault();
						me.getPreviewPanel().doLayout();
						if (Ext.isDefined(panel.controller)) {
							panel.controller.getMainContainer().closeTab(panel);
						}
					}
				}
			});
		}
	}
});
Ext.reg('extmail_email_emailcontainer', ExtMail.Email.EmailContainer);