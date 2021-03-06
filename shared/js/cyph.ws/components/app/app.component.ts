import {ChangeDetectionStrategy, Component} from '@angular/core';
import {AppService} from '../../app.service';


/**
 * Angular component for Cyph web UI.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'cyph-app',
	templateUrl: './app.component.html'
})
export class AppComponent {
	constructor (
		/** @see AppService */
		public readonly appService: AppService
	) {}
}
