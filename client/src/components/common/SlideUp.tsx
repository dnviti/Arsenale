import { forwardRef } from 'react';
import { Slide } from '@mui/material';
import type { TransitionProps } from '@mui/material/transitions';

export const SlideUp = forwardRef(function SlideUp(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});
